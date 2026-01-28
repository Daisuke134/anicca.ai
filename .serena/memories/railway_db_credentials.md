# Railway PostgreSQL Database Credentials

## Production DB (Railway)

| Item | Value |
|------|-------|
| Host | ballast.proxy.rlwy.net |
| Port | 51992 |
| Database | railway |
| User | postgres |
| Password | WgyHhBwqrEVFsXiQNOPrLaNhEayQrVdJ |
| Connection URL | `postgresql://postgres:WgyHhBwqrEVFsXiQNOPrLaNhEayQrVdJ@ballast.proxy.rlwy.net:51992/railway` |

## psql Command

```bash
PGPASSWORD=WgyHhBwqrEVFsXiQNOPrLaNhEayQrVdJ psql -h ballast.proxy.rlwy.net -p 51992 -U postgres -d railway
```

## Notes

- Railway内部URL (`postgres.railway.internal:5432`) はローカルからアクセス不可
- `railway run` で注入される `DATABASE_URL` も内部URL
- ローカルからDB操作する場合は上記の公開URLを使う
- Prisma migration はローカルから直接実行不可（内部URL問題）→ 直接SQLで実行する
