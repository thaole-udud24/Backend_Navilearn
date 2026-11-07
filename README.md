# backend_navilearn

API NaviLearn — Node.js + Express + MongoDB (Mongoose) + Zod + JWT. Xem quy tắc cấu trúc/thêm module tại [`../docs/CODE_RULES.md`](../docs/CODE_RULES.md).

## Chạy

```bash
cp .env.example .env   # chỉnh MONGODB_URI, JWT secrets
npm install
npm run dev             # http://localhost:5000, health: GET /api/v1/health
```

## Script

| Script | Việc |
|---|---|
| `npm run dev` | chạy server (nodemon) |
| `npm run build` | lint + test (không có bước bundle) |
| `npm run lint` / `lint:fix` | ESLint `src` |
| `npm test` | Jest + Supertest |
| `npm run format` | Prettier |

## Cấu trúc

```
src/
├── server.js, app.js
├── config/        # env (Zod), db, cors, logger
├── routes/        # router tổng theo nhóm (admin/student/public/webhook)
├── middlewares/    # authenticate, authorize, validate, errorHandler...
├── modules/<module>/  # routes, validation, controller, service, model, test
├── integrations/   # mailer, storage, ai (stub)
├── jobs/, plugins/, shared/, utils/
```

Thêm module mới: copy `modules/_template` → đổi tên → chỉnh model/validation/service/controller/routes → đăng ký route → viết test. Chi tiết: [`../docs/CODE_RULES.md`](../docs/CODE_RULES.md).
