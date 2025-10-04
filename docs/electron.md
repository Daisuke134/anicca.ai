はじめに
最近、趣味でElectronを使ったアプリを開発しています。その過程で、アーキテクチャ設計についていくつか悩んだポイントがありました。本記事では、実際に採用したアーキテクチャや解決策を紹介します。
今回はサーバーにデータを置かないローカルファーストなデスクトップアプリを作っているということもあり、特に以下の点で悩みました。

フレームワークどうする？
WebのようなREST APIが使えない
データベースどうしよう
アプリのアップデートどうしよう
アプリのコード署名むずい
フレームワークどうする
まずはじめにフレームワークをどうするかという問題がありました。

最初はNext.jsのApp Routerを使ってアプリを作っていました。しかし、Electronアプリは最終的に静的ファイルになるため、Next.jsのServer ComponentsやServer Actionsの恩恵を受けられないという問題がありました。

そのため、Next.jsを使わずにVitest + React Routerで頑張ることにしました。





最終的にElectronではファイルを参照するためURLはfile://になるのですが、React Routerの場合、ハッシュタグに対応した、HashRouterを使うことで、Electronでも快適にページ遷移ができるようになりました。

Electronアプリの場合はNext.jsのようなガッチリしたフレームワークを使うよりも、Vite + React Routerのような軽量なフレームワークを使う方が良いと思います。

WebのようなREST APIが使えない
次に悩んだのは、ElectronアプリはWebアプリと違い、REST APIが使えないということです。
開発中は、ローカルサーバーを立てて、そこにリクエストを送ることでAPIを使うことができますが、リリース後は、ローカルサーバーを立てることができないので、REST APIを使うことができません。

そこで、electron-trpcというライブラリを使って、Electronアプリ内でtRPCを使うことにしました。

tRPCとは、TypeScriptで書かれた型安全なRPCライブラリで、サーバーとクライアントの間で型安全な通信を行うことができます。



tRPCは普通のWebアプリケーションだけの用途に閉じず、いろんな環境間での通信に使えるので、Electronアプリでも使いやすいです。

mainプロセス側
下のようにmainプロセスでtRPCのサーバーを立てて、rendererプロセスでtRPCのクライアントを使うことで、Electronアプリ内でAPIを使うことができます。

main.ts
import { createIPCHandler } from 'electron-trpc/main'
import { initTRPC } from '@trpc/server'
import { z } from 'zod'
// 省略
export const t = initTRPC.create({ isServer: true })
const router = t.router({
  hello: t.procedure.input(z.object({ name: z.string() })).query(async ({ name }) => {
    return `Hello, ${name}!`
  }),
})

createIPCHandler({ router, windows: [mainWindow] })

また、rendererプロセスで、tRPCクライアントを使えるようにするために、preload.tsでexposeElectronTRPCを実行します！

preload.ts
import { exposeElectronTRPC } from 'electron-trpc/main'
process.once('loaded', async () => {
  exposeElectronTRPC()
})

rendererプロセス側
クライアント側は以下のような感じです。

僕はtanstackのreact-queryを使っているので、react-queryとtRPCを組み合わせるために、@trpc/react-queryというライブラリを使っています。

renderer/index.ts
import React, { useState } from 'react'
import { ipcLink } from 'electron-trpc/renderer'
import { createTRPCReact } from '@trpc/react-query'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { AppRouter } from '@main/api'

export const trpcReact = createTRPCReact<AppRouter>()

export function TrpcProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient())
  const [trpcClient] = useState(() =>
    trpcReact.createClient({
      links: [ipcLink()]
    })
  )

  return (
    <trpcReact.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </trpcReact.Provider>
  )
}

データベースどうしよう
Electronアプリで複雑なデータ管理をしたい場合どうするか悩みました。
例えばテーブルの結合や、unique制約やその他の機能を使いたい場合、IndexedDBやlocalStorageでは難しいです。
そこで、WASMの力を借りて、@electric-sql/pgliteというPostgreSQLをブラウザで使えるライブラリを使うことにしました。



今回はブラウザーというよりもmainプロセスでこのライブラリを利用しています。
WASMのいいところはポータブルな技術なので、Macアプリだけじゃなく、Windowsアプリでも正常に動作することです。
環境差異を気にせず気軽に導入できるのがWASMのいいところです。

@electric-sql/pgliteを使うと、PostgreSQLのようなデータベースを使うことができます。

また、今回、環境に依存するPrismaではなく、drizzle-ormというライブラリを使って、データベースのスキーマを定義しました。drizzle-ormではこのpgliteとの組み合わせが簡単にできるので、データベースの操作が簡単にできるようになりました。

Prismaだとクライアント生成時に各プラットフォーム用のバイナリを含める必要があります。しかし、drizzle-ormはこの辺を気にせず使えます！



main/db.ts
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { app } from 'electron'
import path from 'path'

const isDev = process.env.NODE_ENV === 'development'
const dbName = isDev ? 'db-dev' : 'db'

const dbPath = path.join(app.getPath('userData'), dbName)
const client = new PGlite(dbPath)

export const db = drizzle(client)

dbはアプリが利用しているuserDataの中に物理ファイルとしてデータが書き込まれる点がポイントです。

また、開発中のdbと本番のdbが衝突する問題があったので、isDev ? 'db-dev' : 'db'というように、開発中と本番でdb名を変えるようにしています。

マイグレーション
問題は、データベースのマイグレーションです。スキーマを変えたくなった場合にWebではなく、アプリ内でデータベースのマイグレーションを行う必要があります。

そこで、アプリ起動時に必ずマイグレーションが実行されるようにしました。

main.ts
app.whenReady().then(async () => {
  await runMigrate()
})

runMigrateは以下のように書いています。

main/db/migrate.ts
import { migrate } from 'drizzle-orm/pglite/migrator'
import { db } from './db'
import path from 'path'

export const runMigrate = async () => {
  console.log('⏳ Running migrations...')
  const start = Date.now()
  await migrate(db, { migrationsFolder: path.join(__dirname, '../../drizzle') })
  const end = Date.now()
  console.log('✅ Migrations completed in', end - start, 'ms')
}

drizzle-orm/pglite/migratorを使うことで、mainプロセスでマイグレーションが実行できるようになりました。
ちゃんと物理ファイルとして定義したスキーマが書き込まれます！

ただし、drizzleで開発者は事前にnpm run db:generateを実行して、drizzleのスキーマを生成しておく必要があります。

drizzle-kitというライブラリがあるので、これを使うと、drizzleのスキーマを簡単に生成できます。



package.json
{
  "scripts": {
    "db:generate": "drizzle-kit generate"
  }
}

drizzle.config.tsはこんな感じ

import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/main/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: 'database.sqlite'
  },
  driver: 'pglite'
})

アプリのアップデートどうしよう
アプリをApp Storeにリリースする場合は、App Storeの仕組みを使ってアプリのアップデートを行うことができますが、
自分で配布する場合は、アプリのアップデートの仕組みを自分で実装する必要があります。

electron-updaterの利用
Electronアプリのアップデートは、electron-updaterのautoUpdaterを使うことで実装できました。

GitHub Actionsでアプリをビルドして、ビルドしたら特定のURLにアップロードするようにして、アプリをアップデートできるようにしました。

electron-builder.ymlに正しい情報を書いておかないと、アップデートができないので地味に調整が大変でした。

S3などにアップする場合はproviderとしてs3を使うことができますが、自分はgenericを使って、特定のURLにアップロードしています。（R2）

electron-builder.yml
publish:
  - provider: generic
  - url: https://example.com/
build:
  "afterSign": "scripts/notarize.js"

アップデート情報の保存
そして、アプリがアップデートされた場合は、アップデート情報をデータベースに保存することに成功しました。

export async function setUpdateInfo({
  version,
  releaseDate,
  releaseNotes
}: {
  version: string
  releaseDate: string
  releaseNotes: string
}) {
  try {
    await db.delete(update)
    return await db.insert(update).values({
      version,
      releaseDate,
      releaseNotes
    })
  } catch (error) {
    console.error('Failed to set update info in database')
    throw error
  }
}

mainWindow.once('ready-to-show', async () => {
  // ★★★最新バージョンがあるか、チェックしてダウンロード★★★
  await autoUpdater.checkForUpdates()
})
autoUpdater.addListener('update-downloaded', (e) => {
  setUpdateInfo({
    version: e.version,
    releaseDate: e.releaseDate,
    releaseNotes: (e.releaseNotes ?? '') as string
  })
  return true
})

アップデートの実行
そして、rendererプロセスから、アプリを更新したいというメッセージを埋めとった際にこのようにアップデートを実行するようにしています。

main.ts
ipcMain.handle('update', () => {
  if (!mainWindow) return
  // ダイアログを表示して更新があることを伝える
  const result = dialog.showMessageBoxSync(mainWindow, {
    type: 'info',
    buttons: [i18n.t('update.CANCEL'), i18n.t('update.CONTINUE')],
    defaultId: 1,
    title: i18n.t('update.TITLE'),
    message: i18n.t('update.MESSAGE'),
    detail: i18n.t('update.DETAIL')
  })
  // アプリを終了してインストール
  if (result === 1) {
    autoUpdater.quitAndInstall()
  }
})

アプリのコード署名むずい
最後に苦労したのがアプリのコード署名です！せっかくアプリを作ったのに、コード署名がないと、ユーザーがアプリをインストールする際に警告が出てしまいます。
Macの場合、警告どころか、インストールしようとするとセキュリティの設定でブロックされて即ゴミ箱送りにされてしまうので、コード署名は必須です。

コード署名は、Apple Developer Programに登録して、証明書を取得する必要があります。

Apple Developer Programに登録


年間$99でApple Developer Programに登録することでAppleのコード署名を受けることができます。

登録後、証明書をDeveloper -> Certificates, Identifiers & Profiles よりダウンロードできます！
とりあえず、Mac Developmentを選択します！もし、Mac App Storeにリリースする場合は、Mac App Distributionを選択しましょう！



証明書をキーチェーンにインストール
証明書をダウンロードしたら、ダブルクリックしてキーチェーンにインストールします！
インストールしたら、キーチェーンアクセスを開いて、証明書を右クリックしてエクスポートします！
形式はp12でパスワードを設定して書き出します。



Apple Accountでアプリのパスワードを設定
次に、Apple Developer Accountにログインして、App-specific passwordを設定します！



ここからアプリのパスワードを設定します！



設定したパスワードは後で、GitHub ActionsのSecretsにAPPLE_APP_SPECIFIC_PASSWORDとして登録します！

notarize.jsを作成
次に署名に必要なnotarize.jsを作成します！
下のように書いて、electron-builder.ymlのafterSignに指定します！

notarize.js
const { notarize } = require('electron-notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  return await notarize({
    appBundleId: '***.***.***',
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID
  });
};

GitHub Actionsでのコード署名
次にこの証明書をGitHub Actionsで使えるようにします！
先ほど書き出したp12ファイルをBase64エンコードして、GitHubのSecretsに登録します！

base64 -i distribution.p12 | pbcopy

このようにクリップボードにコピーしたBase64エンコードされた文字列をGitHubのSecretsにCERTIFICATES_P12として登録します！先ほど設定したパスワードはCERTIFICATES_P12_PASSWORDとして登録します！
さらに、

GitHub Actionsでのコード署名の設定

Progate Tech Blog により固定
Progateの最新の採用情報はこちら！

ユーザーさんへ良いプロダクトを届けていくことに興味がある方は、ぜひ一度お話しましょう！
カジュアル面談をご希望の方も、「ソフトウェアエンジニア」などを選択し、気軽にご連絡ください。

会社情報
会社紹介資料などはこちら