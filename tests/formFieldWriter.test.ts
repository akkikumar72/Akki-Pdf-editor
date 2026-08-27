import { describe, expect, it, vi } from "vitest";
import {
  AnnotationFlags,
  decodePDFRawStream,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFRawStream,
  PDFStream,
  type PDFWidgetAnnotation,
  StandardFonts,
  TextAlignment,
} from "pdf-lib";
import { FormFieldValidationError } from "../src/editor/formField";
import { writeInteractiveFormField } from "../src/engine/formFieldWriter";
import type { FormFieldOperation } from "../src/types/editor";

function operation(overrides: Partial<FormFieldOperation> = {}): FormFieldOperation {
  return {
    id: `field_${overrides.kind ?? "text"}`,
    type: "form-field",
    kind: "text",
    name: "customer_name",
    pageIndex: 0,
    rect: { x: 40, y: 500, width: 180, height: 28 },
    createdAt: 1,
    ...overrides,
  };
}

async function documentWithPage() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  return { pdf, page };
}

async function reload(pdf: PDFDocument): Promise<PDFDocument> {
  return PDFDocument.load(await pdf.save());
}

function dictName(dict: PDFDict, key: string): string | undefined {
  return dict.lookupMaybe(PDFName.of(key), PDFName)?.decodeText();
}

function normalAppearanceText(pdf: PDFDocument, fieldName: string): string {
  const appearance = pdf.getForm().getField(fieldName).acroField.getWidgets()[0].getAppearances()?.normal;
  expect(appearance).toBeInstanceOf(PDFRawStream);
  return new TextDecoder().decode(decodePDFRawStream(appearance as PDFRawStream).decode());
}

function onAppearanceText(widget: PDFWidgetAnnotation): string {
  const normal = widget.getAppearances()?.normal;
  const onValue = widget.getOnValue();
  expect(normal).toBeInstanceOf(PDFDict);
  expect(onValue).toBeDefined();
  const appearance = (normal as PDFDict).lookup(onValue!, PDFStream);
  expect(appearance).toBeInstanceOf(PDFRawStream);
  return new TextDecoder().decode(decodePDFRawStream(appearance as PDFRawStream).decode());
}

describe("writeInteractiveFormField", () => {
  it("writes interactive text fields with metadata, appearance, defaults, and unique names", async () => {
    const { pdf, page } = await documentWithPage();
    const getFont = vi.fn(async () => pdf.embedFont(StandardFonts.Courier));
    const first = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        name: "Customer name",
        value: "Ada",
        defaultValue: "Unknown",
        tooltip: "Billing contact",
        required: true,
        readOnly: true,
        fillColor: "transparent",
        borderColor: "#abc",
        borderWidth: 2,
        borderStyle: "dashed",
        fontFamily: "Courier",
        fontSize: 11,
        textColor: "#123456",
        align: "center",
        rotation: 90,
      }),
      { getFont },
    );
    const second = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        id: "field_text_2",
        name: "Customer name",
        value: "Grace",
        borderStyle: "underline",
        align: "right",
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({ id: "field_default", name: "default_only", defaultValue: "Fallback" }),
    );

    expect(first).toEqual({
      fieldName: "Customer_name",
      kind: "text",
      mode: "acroform",
      reusedField: false,
    });
    expect(second.fieldName).toBe("Customer_name_2");
    expect(getFont).toHaveBeenCalledWith("Courier");

    const loaded = await reload(pdf);
    const firstField = loaded.getForm().getTextField("Customer_name");
    const secondField = loaded.getForm().getTextField("Customer_name_2");
    expect(firstField.getText()).toBe("Ada");
    expect(firstField.getAlignment()).toBe(TextAlignment.Center);
    expect(firstField.isRequired()).toBe(true);
    expect(firstField.isReadOnly()).toBe(true);
    expect(firstField.acroField.dict.lookup(PDFName.of("TU"), PDFHexString).decodeText()).toBe("Billing contact");
    expect(firstField.acroField.dict.lookup(PDFName.of("DV"), PDFHexString).decodeText()).toBe("Unknown");
    const firstWidget = firstField.acroField.getWidgets()[0];
    const firstBorder = firstWidget.getOrCreateBorderStyle().dict;
    expect(dictName(firstBorder, "S")).toBe("D");
    expect(firstBorder.has(PDFName.of("D"))).toBe(true);
    expect(firstWidget.hasFlag(AnnotationFlags.Print)).toBe(true);
    expect(secondField.getAlignment()).toBe(TextAlignment.Right);
    expect(dictName(secondField.acroField.getWidgets()[0].getOrCreateBorderStyle().dict, "S")).toBe("U");
    expect(loaded.getForm().getTextField("default_only").getText()).toBe("Fallback");
  });

  it("writes solid, dashed, and underline borders into distinct appearance streams", async () => {
    const { pdf, page } = await documentWithPage();
    for (const borderStyle of ["solid", "dashed", "underline"] as const) {
      await writeInteractiveFormField(
        pdf,
        page,
        operation({
          id: `field_${borderStyle}`,
          name: borderStyle,
          borderStyle,
          borderColor: "#000000",
          borderWidth: 2,
        }),
      );
    }

    const loaded = await reload(pdf);
    const solid = normalAppearanceText(loaded, "solid");
    const dashed = normalAppearanceText(loaded, "dashed");
    const underline = normalAppearanceText(loaded, "underline");

    expect(new Set([solid, dashed, underline]).size).toBe(3);
    expect(solid).toContain("h\nB\n");
    expect(dashed).toContain("[3 2] 0 d");
    expect(dashed).toContain("h\nS\n");
    expect(underline).not.toContain("[3 2] 0 d");
    expect(underline).not.toContain("h\nS\n");
    expect(underline).toMatch(/\d+(?:\.\d+)? \d+(?:\.\d+)? l\nS\nQ\n$/);
  });

  it("writes multiline, dropdown, and list box values as live AcroForm controls", async () => {
    const { pdf, page } = await documentWithPage();
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "multiline",
        name: "notes",
        value: "Line one\nLine two",
        rect: { x: 40, y: 610, width: 220, height: 70 },
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "dropdown",
        name: "plan",
        options: ["Starter", "Pro"],
        selectedValues: ["Enterprise"],
        defaultValue: "Starter",
        allowCustomText: true,
        align: "left",
        borderStyle: "solid",
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "listbox",
        name: "regions",
        options: ["North", "South", "West"],
        selectedValues: ["North", "West"],
        defaultValue: "South",
        multiSelect: true,
        rect: { x: 300, y: 500, width: 180, height: 80 },
      }),
    );
    await writeInteractiveFormField(pdf, page, operation({ kind: "dropdown", name: "empty_choice", options: [] }));
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "dropdown",
        name: "multi_plan",
        options: ["Starter", "Pro"],
        selectedValues: ["Starter", "Pro"],
        multiSelect: true,
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "listbox",
        name: "single_region",
        options: ["North"],
        selectedValues: ["North"],
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "listbox",
        name: "default_region",
        options: ["South"],
        defaultValue: "South",
      }),
    );
    await writeInteractiveFormField(pdf, page, operation({ kind: "listbox", name: "empty_list", options: [] }));

    const loaded = await reload(pdf);
    const notes = loaded.getForm().getTextField("notes");
    const plan = loaded.getForm().getDropdown("plan");
    const regions = loaded.getForm().getOptionList("regions");
    expect(notes.isMultiline()).toBe(true);
    expect(notes.getText()).toBe("Line one\nLine two");
    expect(plan.getOptions()).toEqual(["Starter", "Pro"]);
    expect(plan.getSelected()).toEqual(["Enterprise"]);
    expect(plan.isEditable()).toBe(true);
    expect(regions.getOptions()).toEqual(["North", "South", "West"]);
    expect(regions.getSelected()).toEqual(["North", "West"]);
    expect(regions.isMultiselect()).toBe(true);
    expect(regions.acroField.dict.lookup(PDFName.of("DV"), PDFHexString).decodeText()).toBe("South");
    expect(loaded.getForm().getDropdown("empty_choice").getSelected()).toEqual([]);
    expect(loaded.getForm().getDropdown("multi_plan").getSelected()).toEqual(["Starter", "Pro"]);
    expect(loaded.getForm().getOptionList("single_region").getSelected()).toEqual(["North"]);
    expect(loaded.getForm().getOptionList("default_region").getSelected()).toEqual(["South"]);
    expect(loaded.getForm().getOptionList("empty_list").getSelected()).toEqual([]);
  });

  it("reuses radio groups and preserves custom checkbox export values", async () => {
    const { pdf, page } = await documentWithPage();
    const radioOne = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "radio",
        name: "choice_one",
        groupName: "Approval status",
        exportValue: "Approved",
        defaultValue: "Approved",
        checked: true,
        borderStyle: "dashed",
        rect: { x: 40, y: 440, width: 20, height: 20 },
      }),
    );
    const radioTwo = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "radio",
        name: "choice_two",
        groupName: "Approval status",
        exportValue: "Rejected",
        value: "Rejected",
        borderStyle: "underline",
        rect: { x: 80, y: 440, width: 20, height: 20 },
      }),
    );
    const checked = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "checkbox",
        name: "terms",
        exportValue: "Accepted",
        defaultValue: "Accepted",
        checked: true,
        rect: { x: 40, y: 400, width: 22, height: 22 },
      }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "checkbox",
        name: "newsletter",
        defaultValue: "Off",
        checked: false,
        rect: { x: 80, y: 400, width: 22, height: 22 },
      }),
    );
    await writeInteractiveFormField(pdf, page, operation({ kind: "checkbox", name: "plain_check", checked: false }));

    expect(radioOne.reusedField).toBe(false);
    expect(radioTwo).toMatchObject({ fieldName: "Approval_status", reusedField: true });
    expect(checked.mode).toBe("acroform");

    const loaded = await reload(pdf);
    const radio = loaded.getForm().getRadioGroup("Approval_status");
    const terms = loaded.getForm().getCheckBox("terms");
    const newsletter = loaded.getForm().getCheckBox("newsletter");
    expect(radio.getOptions()).toEqual(["Approved", "Rejected"]);
    expect(radio.getSelected()).toBe("Rejected");
    const [approvedWidget, rejectedWidget] = radio.acroField.getWidgets();
    expect(onAppearanceText(approvedWidget)).toContain("[3 2] 0 d");
    expect(onAppearanceText(rejectedWidget)).toMatch(/\d+(?:\.\d+)? \d+(?:\.\d+)? l\nS\nQ\n$/);
    expect(terms.isChecked()).toBe(true);
    expect(terms.acroField.getWidgets()[0].getOnValue()?.decodeText()).toBe("Accepted");
    expect(terms.acroField.dict.lookup(PDFName.of("DV"), PDFName).decodeText()).toBe("Accepted");
    expect(newsletter.isChecked()).toBe(false);
    expect(newsletter.acroField.dict.lookup(PDFName.of("DV"), PDFName).decodeText()).toBe("Off");
    expect(loaded.getForm().getCheckBox("plain_check").isChecked()).toBe(false);
  });

  it("avoids a non-radio group-name collision", async () => {
    const { pdf, page } = await documentWithPage();
    await writeInteractiveFormField(pdf, page, operation({ name: "status", value: "Existing" }));
    const result = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "radio",
        name: "status_radio",
        groupName: "status",
        exportValue: "Open",
        checked: false,
      }),
    );
    expect(result).toMatchObject({ fieldName: "status_2", reusedField: false });
    expect(pdf.getForm().getRadioGroup("status_2").getSelected()).toBeUndefined();
    const ungrouped = await writeInteractiveFormField(
      pdf,
      page,
      operation({ kind: "radio", name: "standalone", exportValue: "Selected" }),
    );
    expect(ungrouped.fieldName).toBe("standalone");
    expect(pdf.getForm().getRadioGroup("standalone").getSelected()).toBeUndefined();
  });

  it("writes button actions, date semantics, and the documented signature fallback", async () => {
    const { pdf, page } = await documentWithPage();
    await writeInteractiveFormField(
      pdf,
      page,
      operation({ kind: "button", name: "reset", buttonLabel: "Reset", buttonAction: "reset" }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({ kind: "button", name: "print", buttonLabel: "Print", buttonAction: "print" }),
    );
    await writeInteractiveFormField(
      pdf,
      page,
      operation({ kind: "button", name: "plain", buttonLabel: "Continue", buttonAction: "none" }),
    );
    const date = await writeInteractiveFormField(
      pdf,
      page,
      operation({
        kind: "date",
        name: "due_date",
        value: "08/27/2026",
        dateFormat: "MM/dd/yyyy",
      }),
    );
    const signature = await writeInteractiveFormField(
      pdf,
      page,
      operation({ kind: "signature", name: "sign_here", value: "Ada Lovelace" }),
    );

    expect(date.mode).toBe("acroform");
    expect(signature.mode).toBe("signature-text-fallback");

    const loaded = await reload(pdf);
    const resetWidget = loaded.getForm().getButton("reset").acroField.getWidgets()[0];
    const printWidget = loaded.getForm().getButton("print").acroField.getWidgets()[0];
    const plainWidget = loaded.getForm().getButton("plain").acroField.getWidgets()[0];
    expect(dictName(resetWidget.dict.lookup(PDFName.of("A"), PDFDict), "S")).toBe("ResetForm");
    const printAction = printWidget.dict.lookup(PDFName.of("A"), PDFDict);
    expect(dictName(printAction, "S")).toBe("JavaScript");
    expect(printAction.lookup(PDFName.of("JS"), PDFHexString).decodeText()).toBe("this.print();");
    expect(plainWidget.dict.has(PDFName.of("A"))).toBe(false);

    const dueDate = loaded.getForm().getTextField("due_date");
    const actions = dueDate.acroField.dict.lookup(PDFName.of("AA"), PDFDict);
    const formatAction = actions.lookup(PDFName.of("F"), PDFDict);
    const keyAction = actions.lookup(PDFName.of("K"), PDFDict);
    expect(formatAction.lookup(PDFName.of("JS"), PDFHexString).decodeText()).toContain("mm/dd/yyyy");
    expect(keyAction.lookup(PDFName.of("JS"), PDFHexString).decodeText()).toContain("mm/dd/yyyy");
    expect(loaded.getForm().getTextField("sign_here").getText()).toBe("Ada Lovelace");
  });

  it("rejects invalid fields before mutating the PDF", async () => {
    const { pdf, page } = await documentWithPage();
    await expect(
      writeInteractiveFormField(pdf, page, operation({ kind: "date", name: "bad_date", value: "2026/08/27" })),
    ).rejects.toBeInstanceOf(FormFieldValidationError);
    expect(pdf.getForm().getFields()).toEqual([]);
  });

  it("preflights unsupported glyphs before registering a field or widget", async () => {
    const { pdf, page } = await documentWithPage();
    const annotationCount = page.node.Annots()?.size() ?? 0;

    await expect(
      writeInteractiveFormField(pdf, page, operation({ name: "unsupported", value: "漢字" })),
    ).rejects.toThrow(/WinAnsi cannot encode/);

    expect(pdf.getForm().getFields()).toEqual([]);
    expect(page.node.Annots()?.size() ?? 0).toBe(annotationCount);
    await expect(pdf.save()).resolves.toBeInstanceOf(Uint8Array);
  });
});
