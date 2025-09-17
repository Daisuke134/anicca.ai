import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: 'サブスクリプションを管理 - Anicca',
  description: '請求情報やキャンセル手続き後にデスクトップアプリへ戻るためのリダイレクトページです。',
};

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  margin: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: '#f5f5f7',
  color: '#1f2933',
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
};

const cardStyle: CSSProperties = {
  background: '#fff',
  padding: '48px 40px',
  borderRadius: '16px',
  boxShadow: '0 16px 32px rgba(15,23,42,0.12)',
  maxWidth: 520,
  textAlign: 'center' as const,
};

const buttonStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 16,
  padding: '12px 20px',
  borderRadius: '999px',
  background: '#2563eb',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
};

export default function ManagePage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1>サブスクリプションを管理しました</h1>
        <p>請求情報やキャンセルの内容は即座に反映されます。変更後は Anicca デスクトップアプリを一度開き直すと最新のプラン状態が読み込まれます。</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: '16px 0 0', textAlign: 'left' }}>
          <li style={{ marginBottom: 8 }}>・アップグレード: 数秒で Pro プランが有効になります。</li>
          <li style={{ marginBottom: 8 }}>・キャンセル: 次回請求まで利用可能です。無料枠へ自動で戻ります。</li>
          <li>・お支払い方法の更新: Stripe Customer Portal で即時に反映されます。</li>
        </ul>
        <a style={buttonStyle} href="https://www.aniccaai.com">Anicca トップへ戻る</a>
      </div>
    </main>
  );
}
