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

object_name en dar_vorige worden gebruikt om documenten te linken aan elkaar

Een mogelijke fout was dat voor documenten uit het formaat hierboven (DOC), er een match kan zijn wanneer het jaartal en de identifier overeenkomen. Voor mededelingen (MED) is dit echter niet zo. Dit laatste is informatie die op het moment van de conversie nog niet geweten was.

# Aanpak:
1. Oplijsten alle procedurestappen met meer dan 1 dossier
2. Originele DORIS records ophalen
3. identifiers bekijken (+ eventueel andere contextuele factoren)

# 1. Oplijsten alle procedurestappen met meer dan 1 dossier

De query `queries\alle_mogelijke_potpourri_dossiers.sparql`, geeft alle dossiers weer waarvan minstens 1 procedurestap ook in een ander dossier zit. Dit geeft echter zeer veel resultaten (16227), waarbij er sommige dossiers honderden procedurestappen hebben, en sommige maar 1.

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
Dan moeten we dit dossier opsplitsen in dossiers met procedurestappen die een duidelijke link hebben in DORIS.

Dit doen we met `queries\procedurestappen_in_potpourri_dossiers.sparql`, die 18172 unieke procedurestappen teruggeeft.

Vervolgens hebben we een algoritme geschreven, dat per dossier alle procedurestappen overloopt, en probeert een geldige 'ketting' te maken op basis van `object_name` en `dar_vorige` uit de DORIS brondata. De eerste procedurestap waarvoor dit lukt, beschouwen we als de 'main' procedurestap, i.e., de procedurestap die er voor gezorgd heeft dat het dossier kan worden gevormd.

Vindt het algoritme zo geen ketting, dan gaan we er van uit dat dit geen correct dossier is.

http://localhost:8889/mogelijke-potpourri-dossiers geeft de volledige lijst van alle mogelijke potpourri dossiers - valid EN invalid - met al hun procedurestappen en bijhorende DORIS records gevonden op basis van `dct:source`.

http://localhost:8889/mogelijke-potpourri-dossiers?validationMatch=valid geeft alle gevalideerde dossiers weer, terwijl http://localhost:8889/mogelijke-potpourri-dossiers?validationMatch=invalid alle als foutief gedetecteerde dossiers weergeeft.

Voorlopig heeft dit als resultaat dat er 229 dossiers zijn die alvast als incorrect worden gedetecteerd. We zitten echter nog met vals positieven, zowel als vasl negatieven. Er zijn immers dossiers waarbij door een fout ingevoerde `object_name` in DORIS wel een juiste ketting kon gemaakt worden, maar die eigenlijk niet bij elkaar horen. Er zijn ook nog dossiers waarbij geen exacte ketting kon gevonden worden via `object_name` en/of `dar_vorige`, maar die wel duidelijk bij elkaar horen.

Meer specifiek krijgen we deze statistieken voor de huidige als incorrect gedetecteerde dossiers:

```
{
  "Totaal aantal dossiers": 229,
  "Aantal dossiers met 122 procedurestappen": 1,
  "Aantal dossiers met 86 procedurestappen": 1,
  "Aantal dossiers met 61 procedurestappen": 1,
  "Aantal dossiers met 55 procedurestappen": 1,
  "Aantal dossiers met 50 procedurestappen": 1,
  "Aantal dossiers met 46 procedurestappen": 1,
  "Aantal dossiers met 39 procedurestappen": 1,
  "Aantal dossiers met 36 procedurestappen": 2,
  "Aantal dossiers met 35 procedurestappen": 1,
  "Aantal dossiers met 34 procedurestappen": 1,
  "Aantal dossiers met 33 procedurestappen": 1,
  "Aantal dossiers met 32 procedurestappen": 1,
  "Aantal dossiers met 31 procedurestappen": 2,
  "Aantal dossiers met 30 procedurestappen": 2,
  "Aantal dossiers met 29 procedurestappen": 3,
  "Aantal dossiers met 26 procedurestappen": 1,
  "Aantal dossiers met 23 procedurestappen": 3,
  "Aantal dossiers met 22 procedurestappen": 2,
  "Aantal dossiers met 21 procedurestappen": 1,
  "Aantal dossiers met 19 procedurestappen": 2,
  "Aantal dossiers met 18 procedurestappen": 1,
  "Aantal dossiers met 17 procedurestappen": 5,
  "Aantal dossiers met 16 procedurestappen": 5,
  "Aantal dossiers met 15 procedurestappen": 4,
  "Aantal dossiers met 14 procedurestappen": 4,
  "Aantal dossiers met 13 procedurestappen": 2,
  "Aantal dossiers met 12 procedurestappen": 5,
  "Aantal dossiers met 11 procedurestappen": 4,
  "Aantal dossiers met 10 procedurestappen": 3,
  "Aantal dossiers met 9 procedurestappen": 9,
  "Aantal dossiers met 8 procedurestappen": 10,
  "Aantal dossiers met 7 procedurestappen": 10,
  "Aantal dossiers met 6 procedurestappen": 8,
  "Aantal dossiers met 5 procedurestappen": 16,
  "Aantal dossiers met 4 procedurestappen": 27,
  "Aantal dossiers met 3 procedurestappen": 38,
  "Aantal dossiers met 2 procedurestappen": 49
}
```

Hoe meer procedurestappen in een dossier, hoe kleiner de kans op een vals negatief resultaat. M.a.w., tussen de dossiers met 2 procedurestappen zitten er wellicht nog goede. Bijvoorbeeld dossier http://themis.vlaanderen.be/id/dossier/8178aa38-dec2-11e9-aa72-0242c0a80002 heeft 2 procedurestappen die wel degelijk bij elkaar horen, maar geen link hebben via `object_name` of `dar_vorige`. In dit specifiek geval lijkt er gelinkt geweest te zijn via `dar_rel_docs` in plaats van `dar_vorige`.

Mogelijks kunnen we als volgende stap ook kijken naar `dar_rel_docs`, eventueel gecombineerd met afstand in datums, gemeenschappelijke woorden in titel, indieners, ... al kan dit ook verkeerde resultaten geven.

Wat we wel kunnen concluderen, is dat we in ieder geval er in zullen slagen om de meest foutieve dossiers te identificeren en te verwijderen of corrigeren.

## 2. Dossiers met 1 enkele procedurestap, waarbij die laatste wel in verscheidene dossiers is opgenomen.

Zie `queries\mogelijke_gesplitte_dossiers.sparql`.

Dit zijn dus mogelijks procedurestappen die hadden moeten samengenomen worden, maar gesplit zijn in 2 of meer dossiers.

Zo tel ik er in de test-db 6217.

Hier bestaat een mogelijke oplossing er uit om op basis van de DORIS nummers de procedurestappen in 1 enkel dossier samen te nemen.

Dit is makkelijker te checken dan het eerste geval, aangezien het aantal dossiers en het aantal procedurestappen hier identiek zijn. We kunnen deze lijst dus overlopen, en voor elke procedurestap de DORIS records bekijken.

To be continued...
