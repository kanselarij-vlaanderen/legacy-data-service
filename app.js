require('dotenv').config();
import { app, errorHandler } from 'mu';
import legacyQueries from './routes/legacyQueries';
import dorisQueries from './routes/dorisQueries';
import informationalQueries from './routes/informationalQueries';
import numberQueries from './routes/numberQueries';

app.use(legacyQueries);
app.use(dorisQueries);
app.use(numberQueries);
app.use(informationalQueries);

app.use(errorHandler);
