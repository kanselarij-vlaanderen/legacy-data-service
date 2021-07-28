# Legacy data service

This service exposes a number of routes that execute SPARQL queries to gain insight in a number of legacy data issues on kaleidos.

## Installation

The service expects a full `kaleidos-project` stack to be running, especially with the database configured and running correctly.

To run this service in your `kaleidos-project` stack, add the following to your `docker-compose.override.yml`:

```
legacy-data-service:
  #image: semtech/mu-javascript-template #only for linux users
  image: semtech/mu-javascript-template:windows #only for windows users
  ports:
    - 8889:80
  environment:
    NODE_ENV: "development"
    DEV_OS: "windows" #only for windows users
  links:
    - triplestore:database
  volumes:
    - /path/to/legacy-data-service/:/app/
    - /path/to/data-folder/data/:/data/
```

Note that the `DEV_OS` variable is optional, to enable live reload on Windows.


## Usage
*(assuming the configuration on port 8889 as above)*

- Oplijsten van alle mededelingen met een beslissing & verslag en hun bijhorend dossier: http://localhost:8889/agendapunt-mededelingen-met-verslag

- Oplijsten van mededelingen die een "DOC" in de naam van de documenten hebben: http://localhost:8889/mededelingen-met-DOC

- Oplijsten van agendapunten met een gelinkte mandataris en met een titel waar het woord “bekrachtiging” in staat: http://localhost:8889/agendapunt-bekrachtiging-met-mandataris

- Oplijsten van alle documenten verbonden aan een agendapunt met een titel waar het woord “bekrachtiging” in staat en die in Kaleidos niet publiek staan.: http://localhost:8889/documenten-bekrachtiging-niet-publiek

- Oplijsten van alle dossiernamen met "goedkeuring" in de titel en daaronder resorterende agendapunt-titels: http://localhost:8889/dossiers-goedkeuring

- Oplijsten van alle dossiers waar een gestandardiseerde vorm van een procedurestapnaam in de titel staat: http://localhost:8889/dossiers-titel-procedurestap

- Oplijsten van alle agendapunten zonder documenten: http://localhost:8889/agendapunten-zonder-documenten

- Oplijsten van alle agendapunten zonder documenten en met een beslissing: http://localhost:8889/agendapunten-zonder-documenten-met-beslissing

- Oplijsten van alle agendapunten zonder documenten en zonder beslissing: http://localhost:8889/agendapunten-zonder-documenten-zonder-beslissing

- Oplijsten van meetings waar er geen document ‘VR AGENDA …’ aan verbonden is: http://localhost:8889/meetings-zonder-agenda-document

- Oplijsten van agenda's met punten zonder titel: http://localhost:8889/agendapunten-zonder-titel

- Oplijsten van agenda's waar er geen doorlopende nummering is van agendapunten: http://localhost:8889/agendas-nummering
