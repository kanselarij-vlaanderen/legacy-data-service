require('dotenv').config();
import { app, errorHandler } from 'mu';
import legacyQueries from './routes/legacyQueries';
import dorisQueries from './routes/dorisQueries';
import informationalQueries from './routes/informationalQueries';
import agendaQueries from './routes/agendaQueries';
import dossierQueries from './routes/dossierQueries';
import mixDossiersFix from './routes/mixDossiersFix';

app.use(legacyQueries);
app.use(dorisQueries);
app.use(agendaQueries);
app.use(informationalQueries);
app.use(mixDossiersFix);

app.use(errorHandler);
