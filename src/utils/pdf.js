import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'

export function generarPDFRutina(student, period, s1,s2,s3,s4){
  const doc=new jsPDF({orientation:'landscape', unit:'mm', format:'a4'})
  const primary='#168FE8'
  // header
  doc.setFillColor(15,23,42); doc.rect(0,0,297,22,'F')
  doc.setFont('helvetica','bold'); doc.setFontSize(16); doc.setTextColor(255,255,255); doc.text('ATLOS GYM', 14, 14)
  doc.setFontSize(9); doc.setFont('helvetica','normal'); doc.setTextColor(148,163,184); doc.text('PLAN MENSUAL', 14, 19)
  doc.setFontSize(10); doc.setTextColor(255,255,255); doc.text(`${student.name} — ${period}`, 297-14, 14, {align:'right'})
  doc.setFontSize(8); doc.setTextColor(148,163,184); doc.text(`${student.edad? student.edad+' años — ':''}${student.enfoque||'Hipertrofia'} — ${student.phone||''}`, 297-14, 19, {align:'right'})
  let y=28
  const todas=[['Semana 1',s1],['Semana 2',s2],['Semana 3',s3],['Semana 4',s4]]
  for(const [titulo, sem] of todas){
    if(!sem.length) continue
    doc.setFillColor(22,143,232); doc.rect(14, y, 269, 8,'F')
    doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(255,255,255); doc.text(titulo.toUpperCase(), 15, y+5.5)
    y+=10
    for(const dia of sem){
      doc.setFont('helvetica','bold'); doc.setFontSize(9); doc.setTextColor(15,23,42); doc.text(dia.name, 14, y+4)
      y+=6
      const body=dia.exercises.map(ex=>{ const [series,reps]=String(ex.detail||'3 × 10').split('×').map(s=>s.trim()); return [ex.name, series||'3', reps||'10', ex.peso?(ex.peso+' kg'):'—', ex.detail||'3 × 10'] })
      if(body.length){
        autoTable(doc,{
          startY:y,
          head:[['Ejercicio','Series','Reps','Peso','Detalle']],
          body,
          theme:'grid',
          styles:{fontSize:8, cellPadding:2, lineColor:[51,65,85], lineWidth:0.1},
          headStyles:{fillColor:[22,143,232], textColor:255, fontStyle:'bold', halign:'center'},
          columnStyles:{0:{cellWidth:115},1:{halign:'center',cellWidth:25},2:{halign:'center',cellWidth:25},3:{halign:'center',cellWidth:30},4:{halign:'center',cellWidth:35}},
          margin:{left:14, right:14}
        })
        y=doc.lastAutoTable.finalY+4
      } else {
        y+=4
      }
      if(y>185){ doc.addPage(); y=14 }
    }
    y+=4
    if(y>185){ doc.addPage(); y=14 }
  }
  doc.setFontSize(7); doc.setTextColor(148,163,184); doc.text(`ATLOS Gym — ${period} — Generado ${new Date().toLocaleDateString('es-AR')} — ${student.name}`, 14, 205)
  return doc
}
