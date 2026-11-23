/** A valid multi-page PDF with a blue rectangle on each page. */
export function createViewerPdf(pageCount = 12) {
  const graphic = "0.1 0.4 0.8 rg\n24 190 170 180 re\nf\n";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${pageCount} /Kids [${Array.from({ length: pageCount }, (_, index) => `${index + 4} 0 R`).join(" ")}] >>`,
    `<< /Length ${graphic.length} >>\nstream\n${graphic}endstream`,
    ...Array.from({ length: pageCount }, () => "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 420] /Contents 3 0 R /Resources << >> >>"),
  ];
  const offsets = [0];
  let pdf = "%PDF-1.4\n";
  for (const [index, object] of objects.entries()) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xref = pdf.length;
  pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  return pdf + `trailer\n<< /Root 1 0 R /Size ${offsets.length} >>\nstartxref\n${xref}\n%%EOF\n`;
}
