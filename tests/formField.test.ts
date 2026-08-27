import { describe, expect, it } from "vitest";
import {
  assertValidFormFieldOperation,
  DEFAULT_FORM_FIELD_APPEARANCE,
  FormFieldValidationError,
  formFieldLabel,
  isValidDateFieldValue,
  normalizeFormFieldOperation,
  normalizeFormFieldOptions,
  reformatDateFieldValue,
  resolveFormFieldAppearance,
  sanitizeFormFieldName,
  uniquifyFormFieldName,
  validateFormFieldOperation,
} from "../src/editor/formField";
import type { FormFieldKind, FormFieldOperation } from "../src/types/editor";

function operation(overrides: Partial<FormFieldOperation> = {}): FormFieldOperation {
  return {
    id: "field_1",
    type: "form-field",
    kind: "text",
    name: "customer_name",
    pageIndex: 0,
    rect: { x: 40, y: 500, width: 180, height: 28 },
    createdAt: 1,
    ...overrides,
  };
}

describe("form field normalization", () => {
  it.each<[FormFieldKind, string]>([
    ["text", "Text field"],
    ["multiline", "Multiline text"],
    ["dropdown", "Dropdown"],
    ["listbox", "List box"],
    ["radio", "Radio button"],
    ["checkbox", "Checkbox"],
    ["button", "Button"],
    ["date", "Date field"],
    ["signature", "Signature field"],
  ])("labels %s controls", (kind, label) => {
    expect(formFieldLabel(kind)).toBe(label);
  });

  it("trims, drops blanks, and de-duplicates options without changing order", () => {
    expect(normalizeFormFieldOptions()).toEqual([]);
    expect(normalizeFormFieldOptions(["  Alpha  ", "", "Alpha", "Beta", "   "])).toEqual(["Alpha", "Beta"]);
  });

  it("sanitizes flat PDF names while preserving Unicode letters", () => {
    expect(sanitizeFormFieldName("  Kund.namn / År\u0000  ")).toBe("Kund_namn_År");
    expect(sanitizeFormFieldName("...", "radio group")).toBe("radio_group");
    expect(sanitizeFormFieldName("...", "***")).toBe("field");
  });

  it("adds a deterministic numeric suffix when names already exist", () => {
    expect(uniquifyFormFieldName("Customer name", [])).toBe("Customer_name");
    expect(uniquifyFormFieldName("Customer name", ["Customer_name", "Customer_name_2"])).toBe("Customer_name_3");
  });

  it("uses stable appearance defaults and preserves explicit appearance", () => {
    expect(resolveFormFieldAppearance(operation())).toEqual(DEFAULT_FORM_FIELD_APPEARANCE);
    expect(
      resolveFormFieldAppearance(
        operation({
          fillColor: "transparent",
          borderColor: "#abc",
          borderWidth: 2,
          borderStyle: "dashed",
          fontFamily: "Helvetica",
          fontSize: 14,
          textColor: "#123456",
          align: "right",
          rotation: 90,
        }),
      ),
    ).toEqual({
      fillColor: "transparent",
      borderColor: "#abc",
      borderWidth: 2,
      borderStyle: "dashed",
      fontFamily: "Helvetica",
      fontSize: 14,
      textColor: "#123456",
      align: "right",
      rotation: 90,
    });
  });

  it("normalizes metadata, choices, labels, and defaults", () => {
    const normalized = normalizeFormFieldOperation(
      operation({
        kind: "dropdown",
        name: "Account.owner",
        groupName: " Team A ",
        tooltip: "  Pick\u0000 one  ",
        value: "Two",
        options: [" One ", "Two", "Two"],
        required: true,
        readOnly: true,
        exportValue: " explicit ",
        allowCustomText: true,
        multiSelect: true,
        buttonLabel: "  Continue  ",
        buttonAction: "print",
        dateFormat: "dd/MM/yyyy",
      }),
    );
    expect(normalized).toMatchObject({
      name: "Account_owner",
      groupName: "Team_A",
      tooltip: "Pick one",
      options: ["One", "Two"],
      selectedValues: ["Two"],
      required: true,
      readOnly: true,
      exportValue: "explicit",
      allowCustomText: true,
      multiSelect: true,
      buttonLabel: "Continue",
      buttonAction: "print",
      dateFormat: "dd/MM/yyyy",
    });
  });

  it("derives safe control-specific defaults without inventing a selection", () => {
    const checkbox = normalizeFormFieldOperation(operation({ kind: "checkbox", name: "", tooltip: "  " }));
    expect(checkbox).toMatchObject({
      name: "checkbox",
      tooltip: undefined,
      selectedValues: [],
      exportValue: "Yes",
      required: false,
      readOnly: false,
      allowCustomText: false,
      multiSelect: false,
      buttonLabel: "Button",
      buttonAction: "none",
      dateFormat: "yyyy-MM-dd",
    });
    expect(normalizeFormFieldOperation(operation({ kind: "radio", value: "Approved" })).exportValue).toBe("Approved");
    expect(normalizeFormFieldOperation(operation({ kind: "button", value: "Submit" })).buttonLabel).toBe("Submit");
    expect(normalizeFormFieldOperation(operation({ selectedValues: [" One ", "One", "Two"] })).selectedValues).toEqual([
      "One",
      "Two",
    ]);
  });
});

describe("form field validation", () => {
  it("validates all supported date formats and real calendar dates", () => {
    expect(isValidDateFieldValue(undefined, "yyyy-MM-dd")).toBe(true);
    expect(isValidDateFieldValue("2024-02-29", "yyyy-MM-dd")).toBe(true);
    expect(isValidDateFieldValue("02/29/2024", "MM/dd/yyyy")).toBe(true);
    expect(isValidDateFieldValue("29/02/2024", "dd/MM/yyyy")).toBe(true);
    expect(isValidDateFieldValue("2023-02-29", "yyyy-MM-dd")).toBe(false);
    expect(isValidDateFieldValue("29-02-2024", "dd/MM/yyyy")).toBe(false);
  });

  it("reformats valid dates without changing the calendar value", () => {
    expect(reformatDateFieldValue("2024-02-29", "yyyy-MM-dd", "MM/dd/yyyy")).toBe("02/29/2024");
    expect(reformatDateFieldValue("02/29/2024", "MM/dd/yyyy", "dd/MM/yyyy")).toBe("29/02/2024");
    expect(reformatDateFieldValue("31/02/2024", "dd/MM/yyyy", "yyyy-MM-dd")).toBeUndefined();
    expect(reformatDateFieldValue(undefined, "yyyy-MM-dd", "dd/MM/yyyy")).toBeUndefined();
  });

  it("accepts a complete valid choice field", () => {
    const field = operation({
      kind: "dropdown",
      options: ["One", "Two"],
      selectedValues: ["Two"],
      fillColor: "transparent",
      borderColor: "#abc",
      textColor: "#123456",
      borderWidth: 0,
      fontSize: 10,
    });
    expect(validateFormFieldOperation(field)).toEqual([]);
    expect(() => assertValidFormFieldOperation(field)).not.toThrow();
  });

  it("reports geometry and appearance errors together", () => {
    const issues = validateFormFieldOperation(
      operation({
        rect: { x: Number.NaN, y: 0, width: 0, height: -1 },
        fillColor: "red",
        borderColor: "#12",
        textColor: "transparent",
        borderWidth: -1,
        fontSize: Number.POSITIVE_INFINITY,
      }),
    );
    expect(issues.map((issue) => issue.field)).toEqual([
      "rect",
      "fillColor",
      "borderColor",
      "textColor",
      "borderWidth",
      "fontSize",
    ]);
  });

  it("validates choice selections, cardinality, and custom dropdown text", () => {
    expect(
      validateFormFieldOperation(operation({ kind: "listbox", options: ["One"], selectedValues: ["One", "Two"] })).map(
        (issue) => issue.message,
      ),
    ).toEqual([
      "Selected values must exist in the field options.",
      "A single-select choice field cannot have multiple selected values.",
    ]);
    expect(
      validateFormFieldOperation(
        operation({ kind: "dropdown", options: ["One"], defaultValue: "Custom", allowCustomText: true }),
      ),
    ).toEqual([]);
    expect(
      validateFormFieldOperation(
        operation({ kind: "dropdown", options: ["One", "Two"], selectedValues: ["One", "Two"], multiSelect: true }),
      ),
    ).toEqual([]);
  });

  it("validates selected values and the default value independently", () => {
    const issues = validateFormFieldOperation(
      operation({
        kind: "listbox",
        options: ["One"],
        selectedValues: ["Missing selection"],
        defaultValue: "Missing default",
      }),
    );
    expect(issues).toEqual([
      { field: "selectedValues", message: "Selected values must exist in the field options." },
      { field: "defaultValue", message: "Default value must exist in the field options." },
    ]);
    expect(
      validateFormFieldOperation(
        operation({ kind: "listbox", options: ["One"], selectedValues: ["One"], defaultValue: "Missing" }),
      ),
    ).toEqual([{ field: "defaultValue", message: "Default value must exist in the field options." }]);
  });

  it("validates radio and checkbox export values", () => {
    expect(validateFormFieldOperation(operation({ kind: "checkbox", exportValue: "" }))[0]?.field).toBe("exportValue");
    expect(validateFormFieldOperation(operation({ kind: "radio", exportValue: "Ja ✓" }))[0]?.message).toContain(
      "printable ASCII",
    );
    expect(validateFormFieldOperation(operation({ kind: "checkbox", exportValue: "Accepted" }))).toEqual([]);
  });

  it("reports invalid date values and exposes structured assertion errors", () => {
    expect(
      validateFormFieldOperation(operation({ kind: "date", value: "2026-08-27", dateFormat: "yyyy-MM-dd" })),
    ).toEqual([]);
    expect(
      validateFormFieldOperation(operation({ kind: "date", defaultValue: "27/08/2026", dateFormat: "dd/MM/yyyy" })),
    ).toEqual([]);
    const field = operation({ kind: "date", value: "31/02/2025", dateFormat: "dd/MM/yyyy" });
    const issues = validateFormFieldOperation(field);
    expect(issues).toEqual([{ field: "value", message: "Date value must match dd/MM/yyyy." }]);
    expect(() => assertValidFormFieldOperation(field)).toThrow(FormFieldValidationError);
    try {
      assertValidFormFieldOperation(field);
    } catch (error) {
      expect(error).toBeInstanceOf(FormFieldValidationError);
      expect((error as FormFieldValidationError).issues).toEqual(issues);
      expect((error as Error).name).toBe("FormFieldValidationError");
    }
  });

  it("reports current and default date errors independently", () => {
    expect(
      validateFormFieldOperation(
        operation({
          kind: "date",
          value: "31/02/2025",
          defaultValue: "30/02/2025",
          dateFormat: "dd/MM/yyyy",
        }),
      ),
    ).toEqual([
      { field: "value", message: "Date value must match dd/MM/yyyy." },
      { field: "defaultValue", message: "Default date value must match dd/MM/yyyy." },
    ]);
  });
});
