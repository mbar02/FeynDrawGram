# FeynDrawGram

A modern, lightweight web application to draw Feynman diagrams and export them directly into **LaTeX (TikZ)** and **Typst (CeTZ)** code. 
You can try it live [here](https://mbarbieri.it/feyndrawgram/).

## Features

* **Multi-format Export:** Generate pure `tikzpicture` environments for LaTeX or `cetz.canvas` blocks for Typst. You can also export your work as an SVG image or save/load it as a JSON file.
* **Custom Propagators:** Native support for straight or curved solid lines, dashed lines, photons (wavy), gluons (springs/coils), and gravitons (double wavy).
* **Extra Toolset:** Add blobs, boxes, and text labels. Text labels are exported as native document text, meaning you can write full LaTeX or Typst math formulas right in the web app (e.g., `$\sqrt{s}$` or `$p_1$`).

## Usage & Dependencies

FeynDrawGram generates clean, self-contained code blocks. To compile the exported files, make sure your document preamble includes the necessary packages (you can find them on the website).

## Feedback & Bugs

For comments, suggestions, or bug reports, feel free to contact me.
