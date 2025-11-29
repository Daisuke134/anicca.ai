<!-- 5ec4d4b3-3218-4139-be90-0c633beb500d f3fe60db-b995-4d6d-8c36-1c1740499866 -->
# JWT/セッション再設計（AT+RT/Keychain/Logout/削除）

## 方針（ベストプラクティス）

- **セッションモデル**: 短命AT(15分) + 長命RT(30日・回転)＋RT再利用検知（検知時は全セッション失効）
- **署名/検証**: ATはHS256署名（`PROXY_AUTH_JWT_SECRET`）。`iss`/`aud`/`iat`/`exp`/`jti`含む。Apple IDトークンは現行どおり`jose`で検証（`iss`/`aud`/`nonce`/`exp`）。
- **保存**: 
  - iOS: Keychain（ThisDeviceOnly, afterFirstUnlock）。UserDefaultsは使用しない。
  - サーバ: RTは生値を保存せず、SHA-256ハッシュ＋デバイスID/UAを紐付け。回転履歴・reuse検知を保持。
- **API**: モバイルAPIはBearer優先。`device-id`/`user-id`は当面フォールバック、近日廃止案内ログ。
- **ログアウト/削除**: RT失効で即時セッション終了。アカウント削除時は全RT無効化＋RevenueCat顧客削除。

## バックエンド実装（主要ファイル）

- `apps/api/src/routes/auth/apple.js`: Apple検証後にAT/RTを発行
- `apps/api/src/routes/auth/refresh.js`: RTでAT/RTを再発行（回転+reuse検知）
- `apps/api/src/routes/auth/logout.js`: RT失効（単一 or 全端末）
- `apps/api/src/middleware/extractUserId.js`: Bearer優先で`sub`抽出（後方互換ヘッダーにフォールバック）
- `apps/api/src/middleware/requireAuth.js`: AT検証（現行を流用）。
- `apps/api/src/routes/mobile/*`: `extractUserId`利用へ更新。
- DB: `docs/migrations/009_refresh_tokens.sql`（新規）

### 擬似パッチ（要点）

- 追加: `docs/migrations/009_refresh_tokens.sql`
```sql
-- 新規: RT保管（ハッシュ）
CREATE TABLE IF NOT EXISTS refresh_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  token_hash TEXT NOT NULL,
  device_id TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  expires_at TIMESTAMP NOT NULL,
  rotated_from UUID,
  revoked_at TIMESTAMP,
  last_used_at TIMESTAMP,
  reuse_detected BOOLEAN DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
```

- 修正: `apps/api/src/routes/auth/apple.js`（要点のみ）
```diff
 import express from 'express';
 import { z } from 'zod';
 import { verifyIdentityToken } from '../../services/auth/appleService.js';
+import { signJwtHs256 } from '../../utils/jwt.js';
+import crypto from 'crypto';
+import { upsertRefreshToken } from '../../services/auth/refreshStore.js';
 
 router.post('/', async (req, res) => {
   // ... 検証 ...
   const verifiedUser = await verifyIdentityToken(identity_token, nonce, user_id);
   if (!verifiedUser) return res.status(401).json({ error: 'token_verification_failed' });
 
-  return res.json({ userId: verifiedUser.userId, ... });
+  const now = Math.floor(Date.now()/1000);
+  const exp = now + 15*60; // 15分
+  const jti = crypto.randomUUID();
+  const accessPayload = { sub: verifiedUser.userId, iat: now, exp, jti, iss: 'anicca-proxy', aud: 'anicca-mobile' };
+  const token = signJwtHs256(accessPayload, process.env.PROXY_AUTH_JWT_SECRET);
+
+  // RT発行（32bytesランダム）
+  const rt = crypto.randomBytes(32).toString('base64url');
+  await upsertRefreshToken({ userId: verifiedUser.userId, token: rt, deviceId: req.get('device-id') || 'unknown', ttlDays: 30, userAgent: req.get('user-agent') });
+
+  return res.json({ userId: verifiedUser.userId, token, expiresAt: exp*1000, refreshToken: rt });
 });
```

- 追加: `apps/api/src/routes/auth/refresh.js`
```js
import express from 'express';
import { rotateAndIssue } from '../../services/auth/refreshService.js';
const router = express.Router();
router.post('/', async (req, res) => {
  const { refresh_token } = req.body || {};
  if (!refresh_token) return res.status(400).json({ error: 'refresh_token_required' });
  const result = await rotateAndIssue(refresh_token, req.get('device-id') || 'unknown', req.get('user-agent'));
  if (result.error) return res.status(result.status || 401).json({ error: result.error });
  return res.json(result); // { token, expiresAt, refreshToken }
});
export default router;
```

- 追加: `apps/api/src/routes/auth/logout.js`（単一RT失効、`all=true`で全失効）
```js
router.post('/', async (req, res) => {
  const { refresh_token, all } = req.body || {};
  if (!refresh_token && !all) return res.status(400).json({ error: 'refresh_token_or_all_required' });
  await revoke(refresh_token, all === true ? { all: true, userFromToken: true } : {});
  return res.status(200).json({ ok: true });
});
```

- 追加: `apps/api/src/middleware/extractUserId.js`
```js
import requireAuth from './requireAuth.js';
export default async function extractUserId(req, res) {
  const h = String(req.headers['authorization']||'');
  if (h.startsWith('Bearer ')) { const a = await requireAuth(req, res); return a?.sub || null; }
  // 後方互換（順次廃止）
  const deviceId = (req.get('device-id')||'').trim();
  const userId = (req.get('user-id')||'').trim();
  if (!deviceId || !userId) { res.status(401).json({ error: 'auth_required' }); return null; }
  return userId;
}
```

- 修正例: `apps/api/src/routes/mobile/realtime.js`
```diff
-import extractUserId from '../../middleware/extractUserId.js';
+import extractUserId from '../../middleware/extractUserId.js';
 router.get('/session', async (req, res) => {
   const userId = await extractUserId(req, res); if (!userId) return;
   // ... 以降同じ
 });
```

- 修正: `apps/api/src/routes/mobile/account.js`（削除時に全RT無効化）
```diff
- // 既存削除処理
+ await revokeAllRefreshTokensForUser(userId);
  // RevenueCat削除→DB削除→204
```


> 内部サービス（`refreshStore.js`/`refreshService.js`）では、RTハッシュ保存、回転、再利用検知（旧RT使用時に`reuse_detected=true`で全失効）を実装。

## iOS実装（主要ファイル）

- 新規: `aniccaios/aniccaios/Security/KeychainService.swift`
- 修正: `Authentication/AuthCoordinator.swift`（AT/RT受領・保存）
- 修正: `Services/NetworkSessionManager.swift`（Bearer付与＋期限前リフレッシュ）
- 修正: `AppState.swift`（UserDefaultsからトークン関連を撤去。Keychainでロード）

### 擬似パッチ（要点）

- 新規: Keychain
```swift
enum KeychainService {
    static func save(_ value: Data, account: String) throws { /* kSecClassGenericPassword, kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly */ }
    static func load(account: String) -> Data? { /* ... */ }
    static func delete(account: String) { /* ... */ }
}
```

- 認証保存（`AuthCoordinator.verifyWithBackend` 内）
```diff
- let credentials = UserCredentials(userId: backendUserId, displayName: displayName, email: email)
+ let jwt = json["token"] as? String
+ let expMs = json["expiresAt"] as? TimeInterval
+ let rt = json["refreshToken"] as? String
+ try? KeychainService.save(Data((rt ?? "").utf8), account: "rt")
+ let credentials = UserCredentials(userId: backendUserId, displayName: displayName, email: email, jwtAccessToken: jwt, accessTokenExpiresAt: expMs.map { Date(timeIntervalSince1970: $0/1000) })
```

- リクエスト共通処理（`NetworkSessionManager` 拡張）
```swift
@MainActor func setAuthHeaders(for request: inout URLRequest) async throws {
    guard case .signedIn(let c) = AppState.shared.authStatus else { throw AuthError.notAuthenticated }
    if let exp = c.accessTokenExpiresAt, exp.addingTimeInterval(-60) <= Date() { // 期限1分前に更新
        try await refreshIfNeeded()
    }
    if let at = c.jwtAccessToken { request.setValue("Bearer \(at)", forHTTPHeaderField: "Authorization") }
}

private func refreshIfNeeded() async throws {
    guard let rtData = KeychainService.load(account: "rt"), let rt = String(data: rtData, encoding: .utf8), !rt.isEmpty else { return }
    var req = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("auth/refresh"))
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.httpBody = try JSONSerialization.data(withJSONObject: ["refresh_token": rt])
    let (data, resp) = try await session.data(for: req)
    guard (resp as? HTTPURLResponse)?.statusCode == 200,
          let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { return }
    let newAT = json["token"] as? String
    let expMs = json["expiresAt"] as? TimeInterval
    let newRT = json["refreshToken"] as? String
    if let newRT = newRT { try? KeychainService.save(Data(newRT.utf8), account: "rt") }
    await MainActor.run { AppState.shared.updateAccessToken(token: newAT, expiresAtMs: expMs) }
}
```

- ログアウト
```swift
func signOut() {
    Task { // サーバへRT失効を通知（失敗は無視）
        if let rt = KeychainService.load(account: "rt").flatMap({ String(data: $0, encoding: .utf8) }) {
            var req = URLRequest(url: AppConfig.proxyBaseURL.appendingPathComponent("auth/logout"))
            req.httpMethod = "POST"
            req.setValue("application/json", forHTTPHeaderField: "Content-Type")
            req.httpBody = try? JSONSerialization.data(withJSONObject: ["refresh_token": rt])
            _ = try? await NetworkSessionManager.shared.session.data(for: req)
        }
    }
    KeychainService.delete(account: "rt")
    AppState.shared.clearUserCredentials()
    AppState.shared.resetState()
}
```


## docs/JWT.md 更新（抜粋・擬似差分）

```diff
- 1. ログイン時にJWTトークンを発行（30日）
+ 1. ログイン時にAT(15分)＋RT(30日, 回転)を発行
- 5. トークンブラックリストの実装
+ 5. RTストア＋回転＋再利用検知（RTハッシュ保存）
- 6. ログアウト時のトークン無効化（ブラックリスト）
+ 6. ログアウト時にRT失効（必要に応じて全端末失効）
```

## 注意点

- Keychainのアクセシビリティは `afterFirstUnlockThisDeviceOnly`。
- RTは必ずハッシュ保存・恒等時間比較。
- AT検証はクロックスキュー±60秒許容。
- 後方互換ヘッダーは段階的に廃止（サーバログで警告）。

### To-dos

- [ ] DBにrefresh_tokensテーブルを追加（マイグレーション作成）
- [ ] Apple検証後にAT/RT発行を実装（apple.js）
- [ ] /api/auth/refresh エンドポイント実装（回転/再利用検知）
- [ ] /api/auth/logout エンドポイントでRT失効（all対応）
- [ ] extractUserIdミドルウェアを追加しモバイルAPIで採用
- [ ] アカウント削除で全RT失効＋RC顧客削除維持
- [ ] KeychainServiceを追加（ThisDeviceOnly, afterFirstUnlock）
- [ ] AuthCoordinatorでAT/RT受領・Keychain保存・AppState更新
- [ ] NetworkSessionManagerにBearer付与/自動リフレッシュを実装
- [ ] docs/JWT.mdをAT+RT方式に更新