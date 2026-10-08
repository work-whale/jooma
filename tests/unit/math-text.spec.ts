import { test, expect } from "@playwright/test";
import { cleanMathText } from "@/app/lib/math-text";

/*
 * The "random slashes" on maths worksheets.
 *
 * Teachers reported calculations full of slashes, and a slash in a question
 * that had no division in it. Staging showed why: the model writes LaTeX, and
 * nothing in Jooma typesets it, so `\( x^2 + 3x + 2 = 0 \)` reached the page
 * with its backslashes and brackets, and `\frac{1}{3}` read as a division.
 *
 * The first two cases are those exact staging lines. Everything after them is
 * either another way the same markup arrives, or ordinary text that must come
 * through untouched.
 */

test.describe("cleanMathText", () => {
  test("the staging worksheet lines read as plain maths", () => {
    expect(cleanMathText("   - (a) \\( x^2 + 3x + 2 = 0 \\)")).toBe("   - (a) x² + 3x + 2 = 0");
    expect(cleanMathText("   - (c) \\( \\frac{1}{3} \\)")).toBe("   - (c) 1/3");
  });

  test("operators become the symbols a printed sheet uses", () => {
    expect(cleanMathText("What is 6 \\times 7?")).toBe("What is 6 × 7?");
    expect(cleanMathText("Work out \\( 48 \\div 6 \\)")).toBe("Work out 48 ÷ 6");
    expect(cleanMathText("\\( 3 \\leq x \\leq 7 \\)")).toBe("3 ≤ x ≤ 7");
    expect(cleanMathText("\\(\\text{Area} = 5 \\times 4\\)")).toBe("Area = 5 × 4");
  });

  test("fractions, roots and powers", () => {
    expect(cleanMathText("\\[ \\frac{x+1}{2} = 4 \\]")).toBe("(x+1)/2 = 4");
    expect(cleanMathText("\\( \\frac{\\frac{1}{2}}{3} \\)")).toBe("(1/2)/3");
    expect(cleanMathText("\\( \\sqrt{16} \\)")).toBe("√16");
    expect(cleanMathText("\\( \\sqrt{x + 1} \\)")).toBe("√(x + 1)");
    expect(cleanMathText("\\( x^{10} \\) and \\( x^10 \\)")).toBe("x¹⁰ and x¹⁰");
    expect(cleanMathText("\\( 2^{-1} \\)")).toBe("2⁻¹");
    expect(cleanMathText("\\( H_2O \\)")).toBe("H₂O");
  });

  test("degrees, in and out of delimiters", () => {
    expect(cleanMathText("A right angle is 90^\\circ.")).toBe("A right angle is 90°.");
    expect(cleanMathText("\\( 90^{\\circ} \\)")).toBe("90°");
  });

  test("dollar maths, but never money", () => {
    expect(cleanMathText("Simplify $3x^2 + x^2$.")).toBe("Simplify 3x² + x².");
    expect(cleanMathText("It costs $5 and the other costs $10.")).toBe("It costs $5 and the other costs $10.");
  });

  test("caret powers in running text", () => {
    expect(cleanMathText("The area is 12 cm^2.")).toBe("The area is 12 cm².");
    expect(cleanMathText("A volume of 8 m^3")).toBe("A volume of 8 m³");
  });

  test("an asterisk between numbers is multiplication, bold is left alone", () => {
    expect(cleanMathText("3 \\* 4 = 12")).toBe("3 × 4 = 12");
    expect(cleanMathText("3*4*5")).toBe("3 × 4 × 5");
    expect(cleanMathText("**Section A** [2 marks]")).toBe("**Section A** [2 marks]");
    expect(cleanMathText("Total: **2** marks")).toBe("Total: **2** marks");
  });

  test("escaped square brackets are kept as brackets, not read as maths", () => {
    // Tiptap writes "[2 marks]" back out as "\[2 marks\]".
    expect(cleanMathText("Explain your answer. \\[2 marks\\]")).toBe("Explain your answer. [2 marks]");
  });

  test("ordinary text comes through untouched", () => {
    const plain = "Name: ______________ Date: __________\n\n1. Fill in the blank: The fraction 5/10 is the same as ____.";
    expect(cleanMathText(plain)).toBe(plain);
    expect(cleanMathText("Saved to C:\\Users\\Teacher\\Documents")).toBe("Saved to C:\\Users\\Teacher\\Documents");
    expect(cleanMathText("")).toBe("");
  });

  test("a stream cut off mid-expression leaves no stray delimiter", () => {
    expect(cleanMathText("Solve \\( 2x + 3")).not.toContain("\\(");
  });
});
