/* Tiny translation layer: English text is the key; PQ.t() falls back to it. Languages: English, Swedish. */
(function () {
  'use strict';
  const PQ = (window.PQ = window.PQ || {});

  const SV = {
    // ribbon / tabs
    'File': 'Arkiv', 'Registration': 'Registrering', 'Reporting': 'Rapport', 'Templates': 'Mallar', 'Summary': 'Sammanställning',
    'XML Import': 'XML-import', 'XML Repair': 'XML-reparation', 'Delete Selected': 'Ta bort markerade', 'Clear Database': 'Töm databasen',
    'Load demo data': 'Ladda demodata', 'Database Toolset': 'Databas', 'Set Operator': 'Ange operatör', 'Set Comment': 'Ange kommentar', 'QA check': 'Kvalitetskontroll',
    'Measurement Series': 'Mätserier', 'Injection:': 'Injektering:', 'Additional Channels:': 'Extrakanaler:', 'Settings:': 'Inställningar:',
    'Chart channels': 'Diagramkanaler', 'Graph Data': 'Grafdata', 'Table Overview': 'Tabellöversikt', 'Export CSV': 'CSV-export',
    'XML for desktop program': 'XML för skrivbordsprogram',
    'Generate Report': 'Skapa rapport', 'Print / Save PDF': 'Skriv ut / Spara PDF', 'Export HTML': 'Exportera HTML', 'Download PDF': 'Ladda ner PDF',
    'Data table in report': 'Datatabell i rapporten', 'Off': 'Av', 'Report options': 'Rapportalternativ',
    'New Template': 'Ny mall', 'Edit Template': 'Redigera mall', 'Delete Template': 'Ta bort mall',
    'Administration Toolset': 'Administration', 'Export Selected': 'Exportera markerade', 'Export All': 'Exportera alla', 'CSV Template Export': 'CSV-mallexport',
    'Export summary CSV': 'Exportera sammanställning (CSV)', 'Hole / stage summary': 'Sammanställning per borrhål / etapp',
    // views
    'Registration Data': 'Registreringsdata', 'Filter…': 'Filtrera…', 'Selected Job Site: ': 'Vald arbetsplats: ',
    'Drag to zoom · Shift+drag to pan · Double-click to reset': 'Dra = zooma · Skift+dra = panorera · Dubbelklick = återställ',
    'PQ Registration Report': 'PQ-registreringsrapport', 'Template Administration': 'Malladministration',
    // backstage
    '← Back': '← Tillbaka', 'Info': 'Info', 'Support': 'Support', 'Settings': 'Inställningar', 'Information': 'Information',
    'Software Version': 'Programversion', 'Storage': 'Lagring', 'Original desktop application': 'Ursprungligt skrivbordsprogram',
    'Settings Registration': 'Inställningar registrering', '2nd Pressure Enable': 'Aktivera andra trycket', '2K Injection Enable': 'Aktivera 2K-injektering',
    'Settings Dates': 'Inställningar datum', 'Date format (screen & report)': 'Datumformat (skärm & rapport)', 'Dates in CSV exports': 'Datum i CSV-export',
    'ISO (safe in every country)': 'ISO (säkert i alla länder)', 'Same as on screen': 'Samma som på skärmen',
    'Backup': 'Säkerhetskopia', 'Download backup': 'Ladda ner säkerhetskopia', 'Restore backup': 'Återställ säkerhetskopia',
    'Settings Reporting': 'Inställningar rapport', 'Load Customer Logo': 'Ladda kundlogotyp', 'Load': 'Ladda', 'Enable Customer Logo': 'Visa kundlogotyp',
    'Settings Jobsite Templates': 'Inställningar arbetsplatsmallar', 'Customer Group 1 Name': 'Kundgrupp 1 namn', 'Customer Group 2 Name': 'Kundgrupp 2 namn', 'Customer Group 3 Name': 'Kundgrupp 3 namn',
    'Cancel': 'Avbryt', 'Save': 'Spara', 'No': 'Nej', 'Yes': 'Ja', 'Close': 'Stäng', 'Importing…': 'Importerar…', 'Drop XML file to import': 'Släpp XML-fil för att importera',
    'Imports accept dd.MM.yyyy and yyyy-MM-dd. CSV exports always use ISO (yyyy-MM-dd HH:mm:ss) so they open correctly in every country.': 'Importen accepterar dd.MM.yyyy och yyyy-MM-dd. CSV-export använder som standard ISO (yyyy-MM-dd HH:mm:ss) så att filerna öppnas rätt i alla länder.',
    'PQ-Registration is a data viewer for grouting injection and Lugeon test registrations: import measurement files, review and annotate them, chart pressure / flow / quantity, produce reports and export CSV.': 'PQ-Registration är ett visningsprogram för registreringar av injektering och Lugeon-prov: importera mätfiler, granska och kommentera dem, visa tryck / flöde / mängd i diagram, skapa rapporter och exportera CSV.',
    'This is an unofficial web re-creation of the desktop application “PQ-Registration V5” by SPÄNI Elektro-Mechanik AG for Häny Mixing and Injection Technology AG (www.haeny.com). It is not affiliated with or endorsed by them.': 'Detta är en inofficiell webbversion av skrivbordsprogrammet ”PQ-Registration V5” från SPÄNI Elektro-Mechanik AG för Häny Mixing and Injection Technology AG (www.haeny.com). Den har inget samband med eller stöd från företagen.',
    // grid headers
    'Job Site': 'Arbetsplats', 'Start Time': 'Starttid', 'Stop Time': 'Stopptid', 'CH': 'Kanal', 'Mix': 'Blandning', 'Hole': 'Borrhål', 'Stage': 'Etapp',
    'Length [m]': 'Längd [m]', 'Mode': 'Läge', 'Duration [s]': 'Varaktighet [s]', 'End P [bar]': 'Sluttryck [bar]', 'Tot. Susp. [l]': 'Tot. susp. [l]',
    'Tot. Add. A [l]': 'Tot. tillsats A [l]', 'Tot. Add. B [l]': 'Tot. tillsats B [l]', 'Tot. Injected [l]': 'Tot. injicerat [l]', 'Stop Reason': 'Stoppanledning', 'Comment': 'Kommentar', 'Operator': 'Operatör',
    'Permeability [l/min/m]': 'Permeabilitet [l/min/m]', 'Lugeon (run)': 'Lugeon (körning)', 'Lugeon (last run)': 'Lugeon (senaste körning)',
    'Reg Mode': 'Reg.-läge', '2K Inj. Ratio [%]': '2K-förhållande [%]', 'Pump Mode': 'Pumpläge', 'P-Max [bar]': 'P-max [bar]', 'P-Operating [bar]': 'P-drift [bar]', 'P-Crack [bar]': 'P-spricka [bar]', 'P-Crack Max [bar]': 'P-spricka max [bar]',
    'T-Crack [s]': 'T-spricka [s]', 'V-Max [l]': 'V-max [l]', 'Q-Min [l/min]': 'Q-min [l/min]', 'Speed-Max [%]': 'Varvtal max [%]', 'GIN [bar*l/m]': 'GIN [bar*l/m]',
    'Runs': 'Körningar', 'Quantity [l]': 'Mängd [l]', 'Specific take [l/m]': 'Specifikt upptag [l/m]', 'Max pressure [bar]': 'Maxtryck [bar]', 'Last start': 'Senaste start',
    'Injection': 'Injektering', 'Lugeon': 'Lugeon', '2K Injection': '2K-injektering', 'Automatic': 'Automatisk', 'GIN Control': 'GIN-reglering', 'GIN Threshold': 'GIN-tröskel',
    // channels / chart
    'Flow Total': 'Flöde totalt', 'Quantity Total': 'Mängd totalt', 'Main Pressure': 'Huvudtryck', '2nd Pressure': 'Andra trycket', 'Flow Pump': 'Flöde pump', 'Flow Add.[A]': 'Flöde tillsats [A]', 'Flow Add.[B]': 'Flöde tillsats [B]',
    'Flow [A+B]': 'Flöde [A+B]', 'Quantity Pump': 'Mängd pump', 'Quantity Add.[A]': 'Mängd tillsats [A]', 'Quantity Add.[B]': 'Mängd tillsats [B]', 'Quantity [A+B]': 'Mängd [A+B]', 'GIN': 'GIN',
    'Relative Timebase': 'Relativ tidsbas', 'Overlay selected runs': 'Lägg markerade körningar över varandra',
    'Pressure': 'Tryck', 'Flow': 'Flöde', 'Flow Additive A': 'Flöde tillsats A', 'Flow Additive B': 'Flöde tillsats B', 'Flow Add. A+B': 'Flöde tillsats A+B',
    'Quantity': 'Mängd', 'Quantity A': 'Mängd A', 'Quantity B': 'Mängd B', 'Quantity A+B': 'Mängd A+B', 'No data': 'Inga data',
    'Select a registration to see its graph': 'Välj en registrering för att se dess diagram',
    'No registrations yet — use XML Import or Load demo data.': 'Inga registreringar än — använd XML-import eller Ladda demodata.',
    'No templates yet — use New Template.': 'Inga mallar än — använd Ny mall.',
    // status / messages
    'templates': 'mallar', 'registrations': 'registreringar', 'selected': 'markerade', 'readings': 'mätvärden', 'runs': 'körningar', 'Imported': 'Importerat',
    'Data is stored locally in this browser': 'Data sparas lokalt i den här webbläsaren',
    'Data is stored locally in this browser (IndexedDB). Nothing is uploaded.': 'Data sparas lokalt i den här webbläsaren (IndexedDB). Inget laddas upp.',
    'Not persistent: browser storage unavailable': 'Sparas inte: webbläsarens lagring är inte tillgänglig',
    'Import Exception': 'Importfel', 'Import cancelled!': 'Importen avbröts!', 'records without header were skipped': 'poster utan header hoppades över',
    'Demo data loaded': 'Demodata laddad',
    'registration(s) will be deleted. Continue?': 'registrering(ar) kommer att tas bort. Fortsätta?', 'Important Question': 'Viktig fråga', 'Clear Database?': 'Tömma databasen?',
    'Export selected data failed! ': 'Exporten av markerade data misslyckades! ', 'Logo is too large (max 1.5 MB)': 'Logotypen är för stor (max 1,5 MB)',
    'template(s) will be deleted. Continue?': 'mall(ar) kommer att tas bort. Fortsätta?',
    'All current data will be replaced by the backup. Continue?': 'All nuvarande data ersätts av säkerhetskopian. Fortsätta?', 'Backup restored': 'Säkerhetskopian återställd',
    // XML repair / export
    'Checks XML files against what the desktop PQ-Registration can import (it only accepts dates as dd.MM.yyyy) and repairs them. Files never leave your computer.': 'Kontrollerar XML-filer mot det som skrivbordsprogrammet PQ-Registration kan importera (det accepterar bara datum som dd.MM.yyyy) och reparerar dem. Filerna lämnar aldrig din dator.',
    'Choose XML files…': 'Välj XML-filer…', 'Target': 'Mål', 'Desktop program (dd.MM.yyyy)': 'Skrivbordsprogram (dd.MM.yyyy)', 'ISO (yyyy-MM-dd)': 'ISO (yyyy-MM-dd)',
    'Import into web app': 'Importera i webbappen', 'Download all (ZIP)': 'Ladda ner alla (ZIP)', 'Download repaired': 'Ladda ner reparerade',
    'Choose or drop one or more XML files.': 'Välj eller släpp en eller flera XML-filer.', 'Needs repair': 'Behöver repareras', 'OK for desktop program': 'OK för skrivbordsprogrammet',
    'The repaired file keeps all values; only the listed problems are changed.': 'Den reparerade filen behåller alla värden; bara de listade problemen ändras.',
    'Repaired file(s) downloaded. Import them in the desktop program with XML Import.': 'Reparerade filer nedladdade. Importera dem i skrivbordsprogrammet med XML-import.',
    'XML for the desktop program. Import it there with XML Import.': 'XML för skrivbordsprogrammet. Importera den där med XML-import.',
    'Generated XML failed its own check – please report this.': 'Den skapade XML-filen klarade inte sin egen kontroll – rapportera detta.',
    'No header / data / footer records found.': 'Inga header-/data-/footer-poster hittades.',
    'Contains an XML declaration (<?xml …?>) – the desktop program cannot read it.': 'Innehåller en XML-deklaration (<?xml …?>) – skrivbordsprogrammet kan inte läsa den.',
    'Wrapped in a <Spaeni> root element – the desktop program adds its own.': 'Omsluten av ett <Spaeni>-rotelement – skrivbordsprogrammet lägger till sitt eget.',
    'Unexpected text outside the records.': 'Oväntad text utanför posterna.',
    'A new header starts before the previous run was closed.': 'En ny header börjar innan föregående körning avslutats.',
    'Data record without a header.': 'Datapost utan header.', 'Footer without a header.': 'Footer utan header.', 'File ends without a footer for this run.': 'Filen slutar utan footer för den här körningen.',
    'Dates are written as yyyy-MM-dd. The desktop program only accepts dd.MM.yyyy and aborts with “Import Exception”.': 'Datum är skrivna som yyyy-MM-dd. Skrivbordsprogrammet accepterar bara dd.MM.yyyy och avbryter med ”Import Exception”.',
    'Dates use mixed formats.': 'Datumen har blandade format.', 'Dates that are not real calendar dates.': 'Datum som inte finns i kalendern.',
    'Decimal value where the desktop program needs a whole number (CH, SAMP, MODE, DURA).': 'Decimaltal där skrivbordsprogrammet kräver heltal (CH, SAMP, MODE, DURA).',
    'Missing attribute the desktop program requires:': 'Attribut som saknas men som skrivbordsprogrammet kräver:',
    'Quantity decreases during the run.': 'Mängden minskar under körningen.', 'Pressure below −1 bar.': 'Tryck under −1 bar.',
    'Footer duration differs from readings × sample interval.': 'Footerns varaktighet avviker från antal mätvärden × samplingsintervall.',
    'Extra attributes from newer firmware (ignored by the desktop program, kept):': 'Extra attribut från nyare firmware (ignoreras av skrivbordsprogrammet, bevaras):',
    'No readings.': 'Inga mätvärden.', 'Run has no end (no footer).': 'Körningen saknar slut (ingen footer).', 'Zero take – no material injected.': 'Inget upptag – inget material injicerat.',
    'Last reading differs from the reported total quantity.': 'Sista mätvärdet avviker från rapporterad total mängd.',
    'Device Lugeon deviates more than 5% from permeability × 10 / mean pressure.': 'Enhetens Lugeon avviker mer än 5 % från permeabilitet × 10 / medeltryck.',
    // PDF
    'Creating PDF…': 'Skapar PDF…', 'PDF could not be created directly – use Print / Save PDF instead.': 'PDF kunde inte skapas direkt – använd Skriv ut / Spara PDF i stället.',
    // template dialog
    'Data:': 'Data:', 'Hole:': 'Borrhål:', 'Stage:': 'Etapp:', 'Interval Enable:': 'Aktivera intervall:', 'Stage Postfix:': 'Etapp-suffix:', 'Min:': 'Min:', 'Max:': 'Max:', 'Interval:': 'Intervall:',
    'Length[m]:': 'Längd [m]:', 'Mix:': 'Blandning:', 'Registration Mode:': 'Registreringsläge:', 'Pump Mode:': 'Pumpläge:', 'Pump Max. Pressure [bar]:': 'Pump max. tryck [bar]:',
    'Pump Operating Pressure [bar]:': 'Pump drifttryck [bar]:', 'Pump Crack Pressure [bar]:': 'Pump sprickstryck [bar]:', 'Pump Max. Crack Pressure [bar]:': 'Pump max. sprickstryck [bar]:', 'Pump Crack Time [s]:': 'Pump spricktid [s]:',
    'Pump max. Volume [l]:': 'Pump max. volym [l]:', 'Pump Flow min [l/min]:': 'Pump flöde min [l/min]:', 'Pump Speed max [%]:': 'Pump varvtal max [%]:', 'GIN [bar*l/m]:': 'GIN [bar*l/m]:', '2K Injection Ratio [%]:': '2K-injekteringsförhållande [%]:',
    'Only positive numbers! Maximal 2 digits after point! Examples: 10.00 / 1000 / 10.25': 'Endast positiva tal! Högst 2 decimaler! Exempel: 10.00 / 1000 / 10.25',
    'Interval: Max must be ≥ Min, the step must be > 0 and at most 500 stages.': 'Intervall: Max måste vara ≥ Min, steget måste vara > 0 och högst 500 etapper.',
    // report
    'Job Site:': 'Arbetsplats:', 'Channel:': 'Kanal:', 'Mixture:': 'Blandning:', 'Length:': 'Längd:', 'Mode:': 'Läge:', 'Start Time:': 'Starttid:', 'Stop Time:': 'Stopptid:', 'Duration:': 'Varaktighet:',
    'Max. Pressure:': 'Max. tryck:', 'Avg. Pressure:': 'Medeltryck:', 'Max. Flow:': 'Max. flöde:', 'Avg. Flow:': 'Medelflöde:', 'Max. GIN:': 'Max. GIN:', 'Max. Lugeon:': 'Max. Lugeon:',
    'Quantity:': 'Mängd:', 'Permeability:': 'Permeabilitet:', 'Lugeon (run):': 'Lugeon (körning):', 'Operator:': 'Operatör:', 'Stop Reason:': 'Stoppanledning:', 'Comment:': 'Kommentar:',
    'Group 1': 'Grupp 1', 'Group 2': 'Grupp 2', 'Group 3': 'Grupp 3',
    'Enter the password to use this app.': 'Ange lösenordet för att använda appen.', 'Unlock': 'Lås upp', 'Wrong password': 'Fel lösenord',
    'This program is a remake and comes with no warranty whatsoever. For reporting, use the original app – this app is merely a one-time solution to fix a bug in a critical scenario.': 'Det här programmet är en nyskapad version och levereras utan någon som helst garanti. Använd originalprogrammet för rapportering – den här appen är endast en engångslösning för att åtgärda ett fel i ett kritiskt läge.',
    'Time': 'Tid', 'Time [s]': 'Tid [s]', '!!No Data Available or Selected!!': '!!Inga data tillgängliga eller markerade!!',
  };

  PQ.LANGS = { en: 'English', sv: 'Svenska' };
  PQ.lang = 'en';
  PQ.setLang = (code) => { PQ.lang = code === 'sv' ? 'sv' : 'en'; };
  PQ.t = (s) => (PQ.lang === 'sv' && SV[s] != null ? SV[s] : s);
})();
