# Analyse incorrect samengenomen legacy dossiers

Deze analyse betreft de zogenaamde "potpourri" dossiers (zo genoemd omdat er "wat van alles" in zit). Dit zijn dossiers samengesteld uit geïmporteerde procedurestappen uit DORIS waarbij één of meer verkeerde links zijn gelegd, met als gevolg een groot dossier met ongerelateerde procedurestappen.

Het doel van de code in `/routes/dossierQueries.js` is om 1) alle mogelijke dossiers die aan deze beschrijving voldoen in kaart te brengen, en 2) deze te valideren, d.w.z.: te analyseren welke hiervan correct zijn, en welke incorrect.

## Formaat DORIS record ids:

In DORIS werd het volgende identifier formaat gebruikt om stukken formeel aan elkaar te linken:

```
VR 2004 1712 DOC.1254;VR 2004 1712 DOC.1254BIS;VR 2004 2412 MED.0011


2004: jaar
1712: 17 december
DOC/DEC/MED: Document Decreet Mededeling
.1254xxx: identifier (zou uniek moeten zijn per jaar)

```

- De identifier is gebruikt om dossiers samen te nemen.
- Indien meerdere dossiers mogelijk waren, zijn alle mogelijkheden aangemaakt.
- Niet alle procedurestappen met 2 dossiers zijn fout!
- Alle procedurestappen uit foute dossiers zitten wel in meerdere dossiers.

## Studie code https://github.com/kanselarij-vlaanderen/kaleidos-legacy-conversion

Voornamelijk werden `object_name` en `dar_vorige` worden gebruikt om documenten te linken aan elkaar. D.w.z., als de ene procedurestap de `object_name` van een andere in zijn `dar_vorige` heeft staan, beschouwen we de procedurestappen als relevant. Deze "vorige" procedurestappen kunnen dan ook weer relevante procedurestappen in hun eigen `dar_vorige` hebben, waardoor een ketting ontstaat van relevante procedurestappen. Dit definiëren we als een "dossier".

Buiten `object_name` en `dar_vorige`, kan het ook dat er een link tussen procedurestappen is via hun documenten. Meer bepaald kan één of meer van de `dar_rel_docs` van een procedurestap voorkomen in de lijst `dar_vorige` van een andere. Ook in dit geval zullen we de twee procedurestappen als relevant beschouwen.

Dan zijn er ook procedurestappen die naar elkaar verwijzen via `dar_aanvullend`, en tenslotte zijn er nog enkele procedurestappen waarbij in DORIS de `dar_vorige` naar de `object_name` van de procedurestap zelf verwijst. Hoogstwaarschijnlijk gaat dit om een invoerfout. Deze procedurestappen zullen we dus ook als correct beschouwen tijdens de validatie van de dossiers.

Een mogelijke fout in de originele conversie is dat voor documenten uit het formaat hierboven (DOC), er een match kan zijn wanneer het jaartal en de identifier overeenkomen. Voor mededelingen (MED) is dit echter niet zo, voor nota's in principe wel. Dit is informatie die op het moment van de conversie nog niet geweten was.

Doordat deze fout er toe kan leiden dat verschillende "kettingen" onbedoeld met elkaar verbonden worden via zo'n irrelevante mededeling, konden er zeer grote, foutieve dossiers ontstaan.

## Aanpak:
1. Oplijsten alle procedurestappen met meer dan 1 dossier
2. Originele DORIS records ophalen
3. identifiers bekijken (+ eventueel andere contextuele factoren)

## 1. Oplijsten alle procedurestappen met meer dan 1 dossier

De query `queries\alle_mogelijke_potpourri_dossiers.sparql`, geeft alle dossiers weer waarvan minstens 1 procedurestap ook in een ander dossier zit. Dit geeft echter zeer veel resultaten (16227), waarbij er sommige dossiers honderden procedurestappen hebben, en sommige maar 1.

`queries\potpourri_stats.sparql` geeft wat meer inzicht. In het resultaat van deze query zien we bijvoorbeeld dat er 1 procedurestap is die in maar liefst 20 dossiers zit, 12 procedurestappen die in 19 dossiers zitten, 12 in 18 dossiers, ..., en tenslotte 8488 procedurestappen die slechts in 2 dossiers zitten.

Ook zijn er 6217 dossiers in deze lijst die maar 1 procedurestap hebben, die weliswaar ook in nog een ander dossier zit (zie verder hieronder).

We kunnen dus beter onderscheid maken tussen twee soorten "potpourri dossiers".

a. Dossiers met 2 of meer procedurestappen, die weinig met elkaar te maken hebben.

b. Dossiers met 1 enkele procedurestap, waarbij die laatste wel in verscheidene dossiers is opgenomen.

### a. Dossiers met 2 of meer procedurestappen, die weinig met elkaar te maken hebben.

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

We moeten per dossier de DORIS brondata voor alle procedurestappen in dat dossier bekijken, ook diegene die enkel in dit dossier zitten (het kan immers dat deze ook niet relevant zijn aan de rest).
Dan moeten we dit dossier opsplitsen in dossiers met procedurestappen die een duidelijke link hebben in DORIS.

Dit doen we met `queries\procedurestappen_in_potpourri_dossiers.sparql`, die 18172 unieke procedurestappen teruggeeft.

Vervolgens hebben we een algoritme geschreven, dat per dossier alle procedurestappen overloopt, en probeert een geldige 'ketting' te maken op basis van `object_name`, `dar_vorige`, `dar_aanvullend` en  `dar_rel_docs` uit de DORIS brondata. De eerste procedurestap waarvoor dit lukt, beschouwen we als de 'main' procedurestap, i.e., de procedurestap die er voor gezorgd heeft dat het dossier kan worden gevormd. Bijvoorbeeld dossier http://themis.vlaanderen.be/id/dossier/8178aa38-dec2-11e9-aa72-0242c0a80002 heeft 2 procedurestappen die wel degelijk bij elkaar horen, maar geen link hebben via `object_name` of `dar_vorige`. In dit specifiek geval lijkt er gelinkt geweest te zijn via `dar_rel_docs` in plaats van `dar_vorige`.

Vindt het algoritme zo geen ketting, dan gaan we er van uit dat dit geen correct dossier is.

Optimalisatie: als er geen "harde" ketting wordt gevonden via `object_name`, `dar_aanvullend`, `dar_vorige` en  `dar_rel_docs`, wordt als laatste redmiddel ook gekeken naar de `titel`, `dar_onderwerp` en `dar_keywords`. Vaak is er immers toch een correct dossier, zonder expliciete links via de identifiers, maar met zeer gelijkaardige titel en/of keywords. Bijvoorbeeld, de volgende procedurestappen zitten in hetzelfde dossier, maar zijn enkel gelinkt door de titel:

```
{
  "titel": "Lokaal Cultuurbeleid - Voorontwerp van decreet betreffende het Lokaal Cultuurbeleid - Principiële goedkeuring m.h.o. op adviesaanvraag aan de Raad van State",
  "dar_keywords": "advies"
}

{
  "titel": "Lokaal Cultuurbeleid - Voorontwerp van decreet betreffende het Lokaal Cultuurbeleid - Resultaat technisch nazicht",
  "dar_keywords": "Lokaal Cultuurbeleid"
}


{
  "titel": "Lokaal Cultuurbeleid Voorontwerp van decreet betreffende het Lokaal Cultuurbeleid Principiële goedkeuring m.h.o. op adviesaanvraag aan de SARC",
  "dar_keywords": "Lokaal cultuurbeleid - nota"
}
```

We gebruiken een heuristiek om alsnog een match te herkennen: als een deel van de titel, onderwerp of keywords overeenkomen met een andere stap binnen hetzelfde dossier, kunnen we deze als match beschouwen. Hiervoor gebruiken we dezelfde similariteitsmetriek als bij het matchen van de legacy ministerdata (string distance). Hiervoor kan je volgende parameters instellen als limieten voor de similariteit (een getal van 0 tot 1, met 0 helemaal niet gelijkaardig, en 1 dezelfde genormaliseerde tekst): `titleThreshold`, `subjectThreshold`, `keywordsThreshold`. Als je niks ingeeft, zijn de standaard parameters: `titleThreshold=0.1`, `subjectThreshold=0.1`, `keywordsThreshold=0.7`.

http://localhost:8889/mogelijke-potpourri-dossiers geeft de volledige lijst van alle mogelijke potpourri dossiers - valid EN invalid - met al hun procedurestappen en bijhorende DORIS records gevonden op basis van `dct:source`. Deze query kan lang duren vooraleer deze is uitgevoerd.

http://localhost:8889/mogelijke-potpourri-dossiers?validationMatch=valid geeft alle gevalideerde dossiers weer, terwijl http://localhost:8889/mogelijke-potpourri-dossiers?validationMatch=invalid alle als foutief gedetecteerde dossiers weergeeft. Bovendien kan je filteren per aantal procedurestappen per dossier, bijvoorbeeld: http://localhost:8889/mogelijke-potpourri-dossiers?validationMatch=invalid&aantalProcedurestappen=5 geeft alle niet-gevalideerde dossiers met 5 procedurestappen weer.

Voorlopig heeft dit met de standaard parameters als resultaat dat er 104 dossiers zijn die alvast als mogelijks incorrect worden gedetecteerd. Hier zitten echter onvermijdelijk nog vals positieven zowel als vals negatieven bij. Er zijn immers dossiers waarbij door een fout ingevoerde `object_name` in DORIS wel een juiste ketting kon gemaakt worden, maar die eigenlijk niet bij elkaar horen. Er zijn ook nog dossiers waarbij geen exacte ketting kon gevonden worden via `object_name`, `dar_rel_docs`, `dar_aanvullend` en/of `dar_vorige`, maar die wel duidelijk bij elkaar horen, ook al zijn de titels, onderwerpen en/of keywords niet gelijkaardig genoeg voor onze metriek.

Meer specifiek krijgen we deze statistieken voor de huidige als incorrect gedetecteerde dossiers, met de parameters

```
"stats": {
  "Totaal aantal dossiers": 104,
  "thresholds": {
    "title": 0.1,
    "subject": 0.1,
    "keywords": 0.7
  },
  "Aantal dossiers met 122 procedurestappen": 1,
  "Aantal dossiers met 86 procedurestappen": 1,
  "Aantal dossiers met 57 procedurestappen": 1,
  "Aantal dossiers met 53 procedurestappen": 1,
  "Aantal dossiers met 50 procedurestappen": 1,
  "Aantal dossiers met 35 procedurestappen": 1,
  "Aantal dossiers met 33 procedurestappen": 1,
  "Aantal dossiers met 32 procedurestappen": 1,
  "Aantal dossiers met 30 procedurestappen": 1,
  "Aantal dossiers met 29 procedurestappen": 1,
  "Aantal dossiers met 25 procedurestappen": 1,
  "Aantal dossiers met 24 procedurestappen": 1,
  "Aantal dossiers met 23 procedurestappen": 1,
  "Aantal dossiers met 22 procedurestappen": 1,
  "Aantal dossiers met 21 procedurestappen": 1,
  "Aantal dossiers met 20 procedurestappen": 1,
  "Aantal dossiers met 19 procedurestappen": 2,
  "Aantal dossiers met 18 procedurestappen": 4,
  "Aantal dossiers met 17 procedurestappen": 4,
  "Aantal dossiers met 16 procedurestappen": 2,
  "Aantal dossiers met 15 procedurestappen": 2,
  "Aantal dossiers met 14 procedurestappen": 4,
  "Aantal dossiers met 13 procedurestappen": 5,
  "Aantal dossiers met 12 procedurestappen": 4,
  "Aantal dossiers met 11 procedurestappen": 2,
  "Aantal dossiers met 10 procedurestappen": 7,
  "Aantal dossiers met 9 procedurestappen": 6,
  "Aantal dossiers met 8 procedurestappen": 10,
  "Aantal dossiers met 7 procedurestappen": 4,
  "Aantal dossiers met 6 procedurestappen": 7,
  "Aantal dossiers met 5 procedurestappen": 5,
  "Aantal dossiers met 4 procedurestappen": 7,
  "Aantal dossiers met 3 procedurestappen": 5,
  "Aantal dossiers met 2 procedurestappen": 8,
  "totaalAantalProcedurestappen": 1451
}
```

Hoe meer procedurestappen in een dossier, hoe kleiner de kans op een vals negatief resultaat. Het aantal dossiers met deze parameters is nog overzichtelijk genoeg om manueel te verifiëren dat het om slecht samengenomen dossiers gaat, zeker in het geval van de grotere dossiers. Eens de similariteit parameters verstrengd worden (en er met andere woorden moeilijker een match gemaakt wordt op basis van titel, onderwerp en/of keywords), zien we dat het aantal kleinere dossiers drastisch verhoogt. Als we bijvoorbeeld de `titleThreshold` en `subjectThreshold` verhogen van `0.1` naar `0.2`, worden er al in totaal 527 dossiers herkend als mogelijks incorrect. Er is dus een tradeoff tussen het herkennen van meer potentiële problemen, en het beheersbaar houden van het aantal manueel te verifiëren dossiers, met meer vals negatieven hoe hoger de thresholds worden.

Voor de herkende dossiers bestaat een mogelijke oplossing er uit om op basis van de DORIS nummers de grote dossiers op te splitsen, of deze dossiers (niet de procedurestappen) te verwijderen, uiteraard na manuele verificatie dat het om een slecht dossier gaat.

Als bedenking bij het verwijderen van de dossiers: als de procedurestappen van te verwijderen dossiers ook in andere dossiers voorkomen, is er geen probleem. Het blijkt echter dat in de foutieve dossiers ook procedurestappen zitten die nergens anders voorkomen. Deze zouden dan zonder dossier overblijven.

Daarom zou de beste aanbeveling zijn om code te schrijven die op basis van de langste "ketting" voor elk dossier het dossier opsplitst in kleinere, valide dossiers. Hiervan kunnen we dan zeker zijn dat de onderwerpen gerelateerd genoeg zijn, en zo gaat de kwaliteit van de legacy dossiers omhoog. Deze logica om de "ketting" voor elke procedurestap te berekenen is reeds geïmplementeerd als deel van de analyse, dus dit zou relatief weinig extra effort vereisen, de meeste code is reeds aanwezig.

Wat moet er concreet gebeuren om deze oplossing waar te maken:

1. Er moet een optimale threshold gezocht worden om de tradeoff aantal herkende dossiers/aantal vals negatieven te bepalen
2. De dossiers in de uiteindelijke lijst moeten door de kanselarij geverifieerd worden als zijnde incorrect
3. Per incorrect dossier moeten nieuwe, geplistste dossiers aangemaakt worden met de originele procedurestappen
4. Deze nieuwe dossiers moeten geverifieerd worden door de kanselarij.

Stap 2 en 4 kunnen eventueel samen worden uitgevoerd, waarbij de kanselarij een lijst krijgt met oude (incorrecte) dossiers, en de bijhorende nieuwe (correcte) dossiers.

### b. Dossiers met 1 enkele procedurestap, waarbij die laatste wel in verscheidene dossiers is opgenomen.

Zie `queries\mogelijke_gesplitte_dossiers.sparql` en http://localhost:8889/mogelijke-gesplitte-dossiers .

Dit zijn dus mogelijks procedurestappen die hadden moeten samengenomen worden, maar gesplit zijn in 2 of meer dossiers.

Zo tel ik er in de test-db 6217.

Hier bestaat mogelijke oplossingen er uit om

1. op basis van de DORIS nummers de procedurestappen in 1 enkel dossier samen te nemen
2. of deze dossiers simpelweg te verwijderen, aangezien elke procedurestap toch ook in een ander dossier zit.
3. niks te doen, als deze dossiers niet storen

De vraag is dus of het nuttig is dat deze procedurestappen elk in hun eigen dossier + in een ander dossier blijven bestaan.

Qua inschatting van werk vereist optie 1 veruit het meeste effort, aangezien in feite de matching opnieuw geïmplementeerd moet worden voor deze procedurestappen.

Optie 2 is relatief eenvoudig, de enige complicatie die er bij komt is om te verifiëren dat we geen "dubbele" verwijderingen uitvoeren (m.a.w. bij iedere delete moet gecontroleerd worden of het andere dossier van de procedurestap niet in dezelfde lijst zat, in welk geval één van de 2 dossiers uiteraard behouden moet worden).

Optie 3 vereist uiteraard geen extra werk.
