const path = require('path');
const express = require('express');
const env = require('./config/env');
const helmet = require('helmet');
const cors = require('cors');
const corsOptions = require('./config/cors');
const requestContext = require('./middlewares/requestContext');
const notFound = require('./middlewares/notFound');
const errorHandler = require('./middlewares/errorHandler');
const routes = require('./routes');

// Only middleware/router assembly here — no business logic.
const app = express();

app.use(helmet());
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
app.use(requestContext);

// Uploaded avatars only (documents are private and go through authenticated download endpoints). helmet's default Cross-Origin-Resource-Policy is same-origin, which would block the
// frontend (another origin) from showing them, so it is relaxed for this static path only.
app.use(
  '/uploads/avatars',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.resolve(env.STORAGE_UPLOAD_DIR, 'avatars')),
);

// N11: admin-report screenshot attachments — same public-static treatment as avatars (small,
// non-sensitive images the admin triage view displays directly), not the private/authenticated
// path student-document/asset uploads are meant for.
app.use(
  '/uploads/admin-report-attachments',
  (req, res, next) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  },
  express.static(path.resolve(env.STORAGE_UPLOAD_DIR, 'admin-report-attachments')),
);

app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
