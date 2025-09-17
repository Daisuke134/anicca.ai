import type { Metadata } from 'next';
import type { CSSProperties } from 'react';

export const metadata: Metadata = {
  title: '決済が完了しました - Anicca',
  description: 'Stripe Checkout 完了後にユーザーへ案内するサンクスページです。',
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
  maxWidth: 480,
  textAlign: 'center' as const,
};

const buttonStyle: CSSProperties = {
  display: 'inline-block',
  marginTop: 12,
  padding: '12px 20px',
  borderRadius: '999px',
  background: '#2563eb',
  color: '#fff',
  textDecoration: 'none',
  fontWeight: 600,
};

export default function SuccessPage() {
  return (
    <main style={pageStyle}>
      <div style={cardStyle}>
        <h1>決済が完了しました</h1>
        <p>ご登録ありがとうございます。数秒後にアプリへ戻り、プラン情報が更新されると利用上限が解除されます。</p>
        <p>アプリが自動で切り替わらない場合は、Anicca を再度開き直してください。</p>
        <a style={buttonStyle} href="https://www.aniccaai.com">Anicca トップへ戻る</a>
      </div>
    </main>
  );
}
