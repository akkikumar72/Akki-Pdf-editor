import { describe, expect, it } from "vitest";
import { PDFDocument } from "pdf-lib";
import { pdfEngine } from "../src/engine/pdfEngine";
import type { FormFieldValues } from "../src/types/editor";

/**
 * Build a fixture PDF that HAS existing AcroForm fields (text, multiline text, checkbox,
 * radio group, dropdown, option list) spread across two pages, so the engine's
 * enumeration and fill paths can be exercised end-to-end.
 */
async function formPdfBytes(): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page1 = pdf.addPage([612, 792]);
  const page2 = pdf.addPage([612, 792]);
  const form = pdf.getForm();

  const fullName = form.createTextField("fullName");
  fullName.setText("Jane");
  fullName.addToPage(page1, { x: 40, y: 700, width: 200, height: 24 });

  const bio = form.createTextField("bio");
  bio.enableMultiline();
  bio.addToPage(page1, { x: 40, y: 600, width: 200, height: 80 });

  const agree = form.createCheckBox("agree");
  agree.addToPage(page1, { x: 40, y: 560, width: 18, height: 18 });

  const plan = form.createRadioGroup("plan");
  plan.addOptionToPage("basic", page1, { x: 40, y: 520, width: 18, height: 18 });
  plan.addOptionToPage("pro", page1, { x: 80, y: 520, width: 18, height: 18 });

  const country = form.createDropdown("country");
  country.setOptions(["US", "UK", "DE"]);
  country.select("US");
  country.addToPage(page1, { x: 40, y: 480, width: 120, height: 24 });

  const tags = form.createOptionList("tags");
  tags.setOptions(["a", "b", "c"]);
  // A field whose widget lives on the second page exercises page-index mapping.
  tags.addToPage(page2, { x: 40, y: 700, width: 120, height: 60 });

  return new Uint8Array(await pdf.save());
}

describe("PdfEngine.getFormFields", () => {
  it("enumerates existing AcroForm fields with type, value, options and page index", async () => {
    const bytes = await formPdfBytes();
    const fields = await pdfEngine.getFormFields(bytes);
    const byName = new Map(fields.map((field) => [field.name, field]));

    expect(byName.get("fullName")).toMatchObject({ type: "text", value: "Jane", pageIndex: 0 });
    expect(byName.get("bio")).toMatchObject({ type: "text", multiline: true, pageIndex: 0 });
    expect(byName.get("agree")).toMatchObject({ type: "checkbox", checked: false, pageIndex: 0 });
    expect(byName.get("plan")).toMatchObject({ type: "radio", pageIndex: 0 });
    expect(byName.get("plan")?.options).toEqual(["basic", "pro"]);
    expect(byName.get("country")).toMatchObject({ type: "dropdown", value: "US", pageIndex: 0 });
    expect(byName.get("country")?.options).toEqual(["US", "UK", "DE"]);
    expect(byName.get("tags")).toMatchObject({ type: "optionlist", pageIndex: 1 });

    // Each descriptor carries a non-zero widget rectangle in page coordinates.
    const name = byName.get("fullName");
    expect(name?.rect.width).toBeGreaterThan(0);
    expect(name?.rect.height).toBeGreaterThan(0);
  });

  it("returns an empty array for a PDF without form fields", async () => {
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 200]);
    const bytes = new Uint8Array(await pdf.save());
    await expect(pdfEngine.getFormFields(bytes)).resolves.toEqual([]);
  });
});

describe("PdfEngine.savePdf – fills existing AcroForm fields", () => {
  it("writes entered values back into the form and they round-trip on reload", async () => {
    const bytes = await formPdfBytes();
    const values: FormFieldValues = {
      fullName: "Akki",
      bio: "Line one\nLine two",
      agree: true,
      plan: "pro",
      country: "DE",
      tags: ["a", "c"],
    };

    const out = await pdfEngine.savePdf(bytes, [], undefined, values);
    const reloaded = await PDFDocument.load(out);
    const form = reloaded.getForm();

    expect(form.getTextField("fullName").getText()).toBe("Akki");
    expect(form.getTextField("bio").getText()).toBe("Line one\nLine two");
    expect(form.getCheckBox("agree").isChecked()).toBe(true);
    expect(form.getRadioGroup("plan").getSelected()).toBe("pro");
    expect(form.getDropdown("country").getSelected()).toEqual(["DE"]);
    expect(form.getOptionList("tags").getSelected()).toEqual(["a", "c"]);
  });

  it("clears values, leaves untouched fields alone and skips invalid options", async () => {
    const bytes = await formPdfBytes();
    const values: FormFieldValues = {
      // Empty string clears the text field.
      fullName: "",
      // Unchecking a checkbox.
      agree: false,
      // An option that does not exist is skipped without aborting the export.
      country: "ZZ",
      // "bio" is intentionally omitted -> keeps its original value.
    };

    const out = await pdfEngine.savePdf(bytes, [], undefined, values);
    const reloaded = await PDFDocument.load(out);
    const form = reloaded.getForm();

    expect(form.getTextField("fullName").getText()).toBeUndefined();
    expect(form.getCheckBox("agree").isChecked()).toBe(false);
    // Untouched field retains its original empty value.
    expect(form.getTextField("bio").getText()).toBeUndefined();
  });

  it("does nothing to the form when no field values are supplied", async () => {
    const bytes = await formPdfBytes();
    const out = await pdfEngine.savePdf(bytes, []);
    const reloaded = await PDFDocument.load(out);
    expect(reloaded.getForm().getTextField("fullName").getText()).toBe("Jane");
  });
});
