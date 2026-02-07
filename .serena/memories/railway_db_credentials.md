# Railway DB 接続情報

## 認証情報の取得方法
- Railway Dashboard → anicca-project → PostgreSQL → Variables タブ
- ローカル: `.cursor/plans/reference/secrets.md` に参照先記載
- CI/CD: Railway が自動注入（`DATABASE_URL` 環境変数）

## 接続方式
| 環境 | 方法 |
|------|------|
| Railway内部（API/Cron） | `DATABASE_URL`（internal URL、自動設定） |
| ローカル開発 | Railway Dashboard から Public URL を取得して使用 |
| マイグレーション | `DATABASE_URL="<public-url>" npx prisma migrate deploy` |

## 注意
- 内部URLはRailway外部からアクセス不可
- 認証情報をSerenaメモリやコードに平文保存しない
