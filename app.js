require('dotenv').config();
import { app, errorHandler } from 'mu';
import legacyQueries from './routes/legacyQueries';
import dorisQueries from './routes/dorisQueries';
import informationalQueries from './routes/informationalQueries';

app.use(legacyQueries);
app.use(dorisQueries);
app.use(informationalQueries);

app.use(errorHandler);
