# Formaat DORIS record ids:
VR 2004 1712 DOC.1254;VR 2004 1712 DOC.1254BIS;VR 2004 2412 MED.0011

2004: jaar
1712: 17 december
DOC/DEC/MED: Document Decreet Mededeling
.1254xxx: identifier (zou uniek moeten zijn per jaar)

- identifier is gebruikt om dossiers samen te nemen
- indien meerdere dossiers mogelijk waren, zijn ze allebei gebruikt
- nu de juiste achterhalen
- Niet alle procedurestappen met 2 dossiers zijn fout!
- Alle foute zitten wel in meerdere dossiers

# Studie code https://github.com/kanselarij-vlaanderen/kaleidos-legacy-conversion

- src/convertor/lib/config/vr_export_parsing_map.py

parser p_doc_list --> dar_rel_docs en dar_vorige worden gebruikt om documenten te linken aan elkaar

- src/convertor/lib/doris_export_parsers.py

# Aanpak:
1. Oplijsten alle procedurestappen met meer dan 1 dossier
2. Originele DORIS records ophalen
3. identifiers bekijken (+ eventueel andere contextuele factoren)

# 1. Oplijsten alle procedurestappen met meer dan 1 dossier

De query `queries\alle_mogelijke_potpourri_dossiers.sparql`, geeft alle dossiers weer waarvan minstens 1 procedurestap ook in een ander dossier zit. Dit geeft echter zeer veel resultaten (16227), waarbij er sommige dossiers honderden procedurestapppen hebben, en sommige maar 1.

`queries\potpourri_stats.sparql` geeft wat meer inzicht. In het resultaat van deze query zien we bijvoorbeeld dat er 1 procedurestap is die in maar liefst 20 dossiers zit, 12 procedurestappen die in 19 dossiers zitten, 12 in 18 dossiers, ..., en tenslotte 8488 procedurestappen die slechts in 2 dossiers zitten.

Ook zijn er 6217 dossiers in deze lijst die maar 1 procedurestap hebben, die weliswaar ook in nog een ander dossier zit (zie verder hieronder).

We kunnen dus beter onderscheid maken tussen twee soorten "potpourri dossiers".

1. Dossiers met 2 of meer procedurestappen, die weinig met elkaar te maken hebben.
2. Dossiers met 1 enkele procedurestap, waarbij die laatste wel in verscheidene dossiers is opgenomen.

## 1. Dossiers met 2 of meer procedurestappen, die weinig met elkaar te maken hebben.

Zie `queries\mogelijk_verkeerd_samengenomen_dossiers.sparql`. Deze query lijst het aantal unieke dossiers op waarvan minstens 1 procedurestap ook in een ander dossier zit.

Dit zijn dus mogelijks verdachte procedurestappen die onterecht zijn samengenomen in hetzelfde dossier.

Let op! Deze zijn niet noodzakelijk allemaal verkeerd. Een procedurestap mag namelijk in meer dan 1 dossier voorkomen, maar enkel als de andere procedurestappen in die dossiers relevant zijn.

Aanvankelijk telde ik in de test-db 10311 zo'n dossiers, MAAR: dit ging puur over **alle** links via `dossier:doorloopt` in de database. Ik merkte echter dat veel dossiers links hebben naar procedurestappen die geen `dct:title`, `dct:created`, en/of `dct:source` hebben. Dit zijn er overigens heel wat in de test-db: 12165 in 7391 dossiers om precies te zijn. (zie `queries/procedurestappen_zonder_created.sparql`)


Als we in de frontend code kijken naar de data die weergegeven wordt op de overview pagina van een dossier (`/pods/cases/subcases/overview`), zien we dat daar gefilterd wordt op procedurestappen die wel dct:created hebben. (Als sidenote: de frontend toont momenteel max 20 procedurestappen, zonder mogelijkheid om naar de volgende pagina te gaan)

Neem http://localhost:8080/dossiers/81209eec-dec2-11e9-aa72-0242c0a80002/deeldossiers als voorbeeld. Hier worden door de frontend 122 procedurestappen opgehaald (zie meta veld in `/analyse/subcases.json`), terwijl volgende SPARQL query er 381 voor dit dossier ophaalt via http://localhost:8890/sparql :

```
PREFIX dossier: <https://data.vlaanderen.be/ns/dossier#>

SELECT COUNT(DISTINCT ?procedurestap) WHERE {
  <http://themis.vlaanderen.be/id/dossier/81209eec-dec2-11e9-aa72-0242c0a80002> dossier:doorloopt ?procedurestap .
}
```

Voeg `?procedurestap dct:created ?created` aan deze query toe, en er blijven er nog 122 over. We gaan er dus van uit dat deze degene zijn die in Kaleidos getoond worden.

Als ik in de query enkel de procedurestappen beschouw die een `dct:created` datum hebben, blijven er nog 9929 unieke dossiers over met 2 of meer procedurestappen waarvan minstens 1 procedurestap ook in een ander dossier zit.

`queries\mogelijk_verkeerd_samengenomen_dossiers_stats.sparql` geeft wat meer inzicht, namelijk dat de echt grote dossiers in deze lijst relatief weinig voorkomen, en dat de overgrote meerderheid van de "verdachte" dossiers 2 of 3 procedurestappen tellen.

Hier bestaat een mogelijke oplossing er uit om op basis van de DORIS nummers de grote dossiers op te splitsen.

We moeten per dossier de DORIS brondata voor alle procedurestappen in dat dossier bekijken, ook diegene die enkel in dit dossier zitten (het kan immers dat deze ook niet relevant zijn aan de rest).
Dan moeten we dit dossier opsplitsen in dossiers met procedurestapppen die een duidelijke link hebben in DORIS.

Dit doen we met `queries\procedurestappen_in_potpourri_dossiers.sparql`, die 18172 unieke procedurestappen teruggeeft.

Een hint naar een mogelijke fout die gemaakt werd bij de conversie is te vinden in http://localhost:8889/potpourri-document-nrs , waar we zien dat zeer veel procedurestappen als `dar_document_nr` `VR/JJJJ/DD/MM/DOC.xxxxx` hebben meegekregen in DORIS. Als deze blijken samengenomen te zijn om deze reden, dan kan dit veel verklaren.

Mogelijks kunnen we ook kijken naar afstand in datums, gemeenschappelijke woorden in titel, indieners, ... al kan dit ook verkeerde resultaten geven.

http://localhost:8889/mogelijke-potpourri-dossiers geeft de volledige lijst van alle mogelijke potpourri dossiers, met al hun procedurestappen en bijhorende DORIS records gevonden op basis van `dct:source`.

http://localhost:8889/potpourri-dossiers-doris-links geeft dezelfde lijst, maar dan met enkel de `dar_document_nr`, `dar_vorige` en `dar_rel_docs` links per procedurestap (dit is iets overzichtelijker).

## 2. Dossiers met 1 enkele procedurestap, waarbij die laatste wel in verscheidene dossiers is opgenomen.

Zie `queries\mogelijke_gesplitte_dossiers.sparql`.

Dit zijn dus mogelijks procedurestappen die hadden moeten samengenomen worden, maar gesplit zijn in 2 of meer dossiers.

Zo tel ik er in de test-db 6217.

Hier bestaat een mogelijke oplossing er uit om op basis van de DORIS nummers de procedurestappen in 1 enkel dossier samen te nemen.

Dit is makkelijker te checken dan het eerste geval, aangezien het aantal dossiers en het aantal procedurestappen hier identiek zijn. We kunnen deze lijst dus overlopen, en voor elke procedurestap de DORIS records bekijken.
