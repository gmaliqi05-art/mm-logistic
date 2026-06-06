function o(c){return c?String(c).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"):""}function a(c){return(Math.round(c*100)/100).toFixed(2)}function x(c,n,u){const t=new Blob([c],{type:`${u};charset=utf-8;`}),m=URL.createObjectURL(t),s=document.createElement("a");s.href=m,s.download=n,s.click(),URL.revokeObjectURL(m)}function p(c,n){const u=c.items??[],t=c.contact,m=(t==null?void 0:t.name)??"Kunde",s=new Map;u.forEach(e=>{const r=e.vat_rate??19,b=e.line_total??0,$=b*r/100,y=s.get(r)??{taxable:0,tax:0};y.taxable+=b,y.tax+=$,s.set(r,y)});const l=Array.from(s.entries()).map(([e,r])=>`
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${c.currency}">${a(r.taxable)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${c.currency}">${a(r.tax)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${e>0?"S":"Z"}</cbc:ID>
        <cbc:Percent>${e}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>`).join(""),d=u.map((e,r)=>{const b=e.vat_rate??19;return`
  <cac:InvoiceLine>
    <cbc:ID>${r+1}</cbc:ID>
    <cbc:InvoicedQuantity unitCode="C62">${a(e.quantity)}</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="${c.currency}">${a(e.line_total??0)}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${o(e.description||"Artikel")}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>${b>0?"S":"Z"}</cbc:ID>
        <cbc:Percent>${b}</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="${c.currency}">${a(e.unit_price??0)}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>`}).join(""),i=`<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:xoev-de:kosit:standard:xrechnung_2.3</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${o(c.invoice_number)}</cbc:ID>
  <cbc:IssueDate>${c.invoice_date}</cbc:IssueDate>
  ${c.due_date?`<cbc:DueDate>${c.due_date}</cbc:DueDate>`:""}
  <cbc:InvoiceTypeCode>${c.invoice_type==="credit_note"?"381":"380"}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${c.currency}</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${o(n.name)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${o(n.address)}</cbc:StreetName>
        <cbc:CityName>${o(n.city)}</cbc:CityName>
        <cbc:PostalZone>${o(n.postal_code)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${o(n.country||"DE")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${n.vat_number?`<cac:PartyTaxScheme><cbc:CompanyID>${o(n.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`:""}
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PartyName><cbc:Name>${o(m)}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${o(t==null?void 0:t.address)}</cbc:StreetName>
        <cbc:CityName>${o(t==null?void 0:t.city)}</cbc:CityName>
        <cbc:PostalZone>${o(t==null?void 0:t.postal_code)}</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>${o((t==null?void 0:t.country)||"DE")}</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      ${t!=null&&t.vat_number?`<cac:PartyTaxScheme><cbc:CompanyID>${o(t.vat_number)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>`:""}
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${c.currency}">${a(c.vat_amount??0)}</cbc:TaxAmount>${l}
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${c.currency}">${a(c.subtotal??0)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${c.currency}">${a(c.subtotal??0)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${c.currency}">${a(c.total??0)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="${c.currency}">${a(c.total??0)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${d}
</Invoice>`;x(i,`XRechnung_${c.invoice_number}.xml`,"application/xml")}function I(c,n,u){const t=["Umsatz (ohne Soll/Haben-Kz)","Soll/Haben-Kennzeichen","WKZ Umsatz","Konto","Gegenkonto (ohne BU-Schlüssel)","BU-Schlüssel","Belegdatum","Belegfeld 1","Buchungstext","Beleginfo - Art 1","Beleginfo - Inhalt 1"],m=e=>{const r=new Date(e),b=String(r.getDate()).padStart(2,"0"),$=String(r.getMonth()+1).padStart(2,"0");return`${b}${$}`},s=c.map(e=>[a(Math.abs(e.amount)).replace(".",","),e.amount>=0?"S":"H","EUR",e.account??"",e.counterAccount??"",e.vatKey??"",m(e.date),e.invoiceNumber??"",e.description.replace(/[",;]/g," ").slice(0,60),e.contactName?"Kunde":"",e.contactName??""]),l=[t,...s].map(e=>e.map(r=>`"${r}"`).join(";")).join(`\r
`),i=`"EXTF";700;21;"Buchungsstapel";7;;;;"${n.replace(/-/g,"")}";"${u.replace(/-/g,"")}";"";;;;"EUR";;;;;;;;;;;;;;;\r
`+l;x(i,`DATEV_Export_${n}_${u}.csv`,"text/csv")}function D(c,n){const u=[`Umsatzsteuer-Voranmeldung - ${n}`,`Zeitraum: ${c.period.from} bis ${c.period.to}`,"","Kennzahl;Bezeichnung;Betrag EUR",`81;Umsatze zu 19 % (steuerpflichtig);${a(c.revenue19)}`,`86;Umsatze zu 7 % (steuerpflichtig);${a(c.revenue7)}`,`35;Steuerfreie Umsatze;${a(c.revenue0)}`,`181;Umsatzsteuer 19 %;${a(c.vatCollected19)}`,`186;Umsatzsteuer 7 %;${a(c.vatCollected7)}`,`66;Vorsteuer;${a(c.vatPaid)}`,`83;Verbleibende Umsatzsteuer-Vorauszahlung;${a(c.vatDue)}`].join(`\r
`);x(u,`UStVA_${c.period.from}_${c.period.to}.csv`,"text/csv")}export{D as a,p as b,I as e};


export { a }