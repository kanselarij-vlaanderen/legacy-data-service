# Analyse verkeerd genummerde of gecategoriseerde agendapunten en mededelingen

Deze analyse geeft duiding bij de code in `/routes/agendaQueries.js`, en geeft een mogelijke oplossing voor KAS-2266 en KAS-2085.

# De problemen

In een aantal geïmporteerde agenda's uit DORIS is ofwel de nummering van de agendapunten incorrect, ofwel staan er nota's onder de mededelingen, of beide.

Het is onduidelijk waar deze fout is gebeurd in de conversie code, maar gelukkig kunnen we dit relatief eenvoudig oplossen.

# De analyse

De volgende queries uit `routes/agendaQueries.js` geven een inzicht in hoeveel agenda's dit probleem vertonen, en wat we er aan kunnen doen.

- http://localhost:8889/agendas-NaN geeft een overzicht van de agena's waar een agendapunt geef geldig nummer heeft gekregen. Dit werd dan getoond als `NaN` in de frontend. Ondertussen is dit echter opgelost

- http://localhost:8889/agendas-nummering lijst alle agenda's op waar er een ontbrekend nummer in de agendapunten (nota's) voorkomt, en welke nummers er ontbreken. M.a.w., als de nummering van een agendapunt springt van 10 naar 15, zal deze lijst aangeven dat 11, 12, 13 en 14 ontbreken. In de huidige databank vinden we zo 136 agenda's.

- http://localhost:8889/fixable-agendas-nummering bekijkt voor alle voorgaande agenda's de mededelingen, en haalt het originele `dar_doc_type` en/of `dar_fiche_type` op uit de DORIS metadata. Als er een mededeling aangetroffen wordt die origineel gecategoriseerd werd als nota, en het volgnummer van deze mededeling komt overeen met een ontbrekend nummer, dan kan dit automatisch opgelost worden door de mededeling naar een nota te veranderen. In de huidige databank kunnen we zo voor 47 agenda's de nummering (deels) corrigeren.

- http://localhost:8889/unfixable-agendas-nummering toont een lijst van alle agenda's met een foute nummering waar de bovenstaande automatische fix niet zal werken. In de huidige databank vinden we zo 89 agenda's.

- http://localhost:8889/agendas-nummering-sparql-fix genereerst een SPARQL fix voor de mededelingen om te zetten naar nota's voor de fixable agenda's.

- http://localhost:8889/agendas-met-DORIS-id lijst alle agendas op met agendapunten met een DORIS id, zodat we weten waar er extra data te vinden is (anders kunnen we toch niks doen).

- http://localhost:8889/agendas-met-DORIS-id-en-foute-nummering lijst alle agendas op met agendapunten met een DORIS id én een foutieve nummering. Dit zijn er 131, dus 5 minder dan `agendas-nummering`

- http://localhost:8889/mededelingen-nota-in-DORIS?checkDocumentsAndPriority=true geeft een lijst van alle agenda's waar minstens 1 mededeling in zit die a.d.h.v. het DORIS `dar_doc_type` of `dar_fiche_type` als 'Nota' of 'Perkament' werd gecategoriseerd, EN waarvan de geagendeerde stukken (de documenten) geen document bevatten waar `MED` in voorkomt. Deze zullen dus enkel documenten hebben van de vorm `VR XXXX XXXX DOC.XXXX`, `VR XXXX XXXX DEC.XXXX en dergelijke. Zo zijn er 101 agenda's. Wat blijkt uit verder onderzoek: **alle** agenda's uit de lijst `fixable-agendas-nummering`, komen ook in deze lijst voor. M.a.w., als we deze mededelingen naar een nota omvormen, corrigeren we zowel het probleem van de nummering waar mogelijk, als het algemenere probleem van mededelingen die onterecht als nota werden ingevoerd.

- http://localhost:8889/final-check-nota-mededelingen checkt in feite wat ik hierboven zeg. Deze route is vooral voor mezelf om af te checken of de data correct is, en mag voor de rest genegeerd worden
