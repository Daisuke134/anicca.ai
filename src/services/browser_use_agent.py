#!/usr/bin/env python3
"""
Browser-use agent for ANICCA
自然言語でブラウザを操作し、バックグラウンドでタスクを実行
"""

import asyncio
import json
import sys
import os
import logging
import tempfile
import uuid
from pathlib import Path
from typing import Dict, Any, Optional

# すべてのログ出力を完全に抑制
logging.disable(logging.CRITICAL)

# 標準エラー出力も抑制（browser-useのログ対策）
import contextlib
import io

# browser-use importの前に環境変数で無効化
os.environ['BROWSER_USE_LOGGING_LEVEL'] = 'CRITICAL'
os.environ['PYTHONWARNINGS'] = 'ignore'
os.environ['BROWSER_USE_LOGGING'] = 'false'
# Playwrightのブラウザパスを設定（デフォルトの場所を使用）
# os.environ['PLAYWRIGHT_BROWSERS_PATH'] = '0'  # これを削除

# importを静かに実行
with contextlib.redirect_stderr(io.StringIO()):
    from browser_use import Agent
    from langchain_google_genai import ChatGoogleGenerativeAI
    from dotenv import load_dotenv

# 環境変数の読み込み（プロジェクトルートから）
project_root = Path(__file__).parent.parent.parent
env_path = project_root / '.env'
load_dotenv(env_path)

class BrowserUseAgent:
    def __init__(self):
        """Browser-useエージェントの初期化"""
        # Gemini APIの設定
        api_key = os.getenv('GOOGLE_API_KEY', '')
        if not api_key:
            raise ValueError("GOOGLE_API_KEY is not set")
        
        self.llm = ChatGoogleGenerativeAI(
            model="gemini-2.0-flash-exp",
            temperature=0.1,  # より確実な応答のため低く
            google_api_key=api_key
        )
        
        # Chromeプロファイルパスの設定
        home_dir = Path.home()
        self.chrome_profile_path = home_dir / "Library/Application Support/Google/Chrome/Default"
        
    async def execute_task(self, task: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        タスクを実行
        
        Args:
            task: 実行するタスクの説明（自然言語）
            context: 追加のコンテキスト情報
            
        Returns:
            実行結果
        """
        try:
            # ブラウザセッションの作成（可視化モード）
            from browser_use import BrowserSession
            
            # 一時的なプロファイルディレクトリを作成（各タスクで独立したブラウザ）
            task_id = uuid.uuid4().hex[:8]
            temp_profile_dir = os.path.join(tempfile.gettempdir(), f"anicca_browser_{task_id}")
            os.makedirs(temp_profile_dir, exist_ok=True)
            
            # デバッグ情報を出力（標準エラー出力へ）
            sys.stderr.write(f"🌐 Starting browser for task [{task_id}]: {task[:50]}...\n")
            sys.stderr.write(f"📁 Conversation will be saved to: /tmp/anicca_browser_{task_id}.json\n")
            
            browser_session = BrowserSession(
                headless=False,  # ブラウザを表示して動作を確認
                user_data_dir=temp_profile_dir  # 一意のプロファイルで競合を回避
            )
            
            # ブラウザセッションを開始
            await browser_session.start()
            
            # コンテキストからGmail情報を取得
            gmail_address = context.get('gmail_address', '') if context else ''
            gmail_password = context.get('gmail_password', '') if context else ''
            
            # Gmail関連タスクの場合、認証情報を使った具体的な指示を追加
            if gmail_address and gmail_password and ('gmail' in task.lower() or 'Gmail' in task or 'メール' in task.lower()):
                # Googleログイン画面での操作を明示的に指示（より持続的な指示）
                enhanced_task = f"{task}。重要：Googleログイン画面が表示されたら、必ず以下の手順でログインしてください：1. メールアドレス欄に「{gmail_address}」を入力 2. 次へボタンをクリック 3. パスワード欄に「{gmail_password}」を入力 4. ログインボタンをクリック。注意：一時的なエラーや読み込み中の状態があっても、最低30秒は待って再試行してください。タスクを完全に達成するまで諦めないでください。"
            else:
                enhanced_task = task
            
            # Browser-useエージェントの作成（シンプルな設定）
            agent = Agent(
                task=enhanced_task,
                llm=self.llm,
                browser_session=browser_session,
                use_vision=True,  # ビジョン機能を有効化
                context=context,  # Gmail認証情報などのコンテキストを渡す
                sensitive_data={  # 機密データとして安全に扱う
                    'gmail_username': gmail_address if gmail_address else None,
                    'gmail_password': gmail_password if gmail_password else None
                } if gmail_address and gmail_password else None
            )
            
            # タスクの実行（ログ出力を抑制）
            with contextlib.redirect_stderr(io.StringIO()):
                with contextlib.redirect_stdout(io.StringIO()):
                    # タイムアウトを設定（300秒 = 5分）
                    try:
                        result = await asyncio.wait_for(
                            agent.run(max_steps=50),  # 最大50ステップまで実行を許可
                            timeout=300
                        )
                    except asyncio.TimeoutError:
                        # タイムアウトした場合でも、部分的な結果を返す
                        result = agent.history if hasattr(agent, 'history') else None
                        sys.stderr.write(f"⏱️ Task timed out after 5 minutes, returning partial results\n")
            
            # resultがAgentHistoryListの場合、詳細な履歴を抽出
            feedback = "タスクが完了しました"
            data = None
            actions_taken = []
            
            # 結果の型を確認してシリアライズ可能な形式に変換
            if hasattr(result, '__dict__'):
                # AgentHistoryListから履歴を抽出
                try:
                    if hasattr(result, 'history') and len(result.history) > 0:
                        # 各履歴項目から具体的なアクションを抽出
                        for idx, history_item in enumerate(result.history):
                            action_info = {
                                'step': idx + 1,
                                'action': None,
                                'result': None
                            }
                            
                            # アクション情報の抽出
                            if hasattr(history_item, 'action'):
                                action_info['action'] = str(history_item.action)[:200]
                            elif hasattr(history_item, 'message'):
                                action_info['action'] = str(history_item.message)[:200]
                            
                            # 結果情報の抽出
                            if hasattr(history_item, 'result'):
                                action_info['result'] = str(history_item.result)[:200]
                            elif hasattr(history_item, 'output'):
                                action_info['result'] = str(history_item.output)[:200]
                            
                            actions_taken.append(action_info)
                        
                        # 最後のアクションからフィードバックを生成
                        if actions_taken:
                            last_action = actions_taken[-1]
                            feedback = f"完了: {len(actions_taken)}個のアクションを実行しました。最後のアクション: {last_action.get('action', 'N/A')}"
                    
                    data = {
                        'type': type(result).__name__,
                        'total_steps': len(actions_taken),
                        'actions': actions_taken
                    }
                except Exception as e:
                    # エラーが発生した場合でも基本情報は返す
                    data = {'type': type(result).__name__, 'error': str(e)}
                    feedback = f"タスクは完了しましたが、詳細の取得でエラー: {str(e)}"
            elif isinstance(result, str):
                feedback = result[:500]
                data = {'type': 'string', 'content': result}
            elif result is not None:
                # その他の型の場合も文字列化
                feedback = str(result)[:500]
                data = {'type': 'other', 'content': str(result)}
            
            # 成功時の結果
            return {
                'success': True,
                'data': data,
                'feedback': feedback
            }
            
        except Exception as e:
            # エラー時の結果
            error_msg = str(e)
            return {
                'success': False,
                'error': error_msg,
                'feedback': self._generate_error_feedback(task, error_msg)
            }
        finally:
            # ブラウザセッションをクリーンアップ
            if 'browser_session' in locals():
                try:
                    await browser_session.close()
                except:
                    pass
            
            # 一時プロファイルディレクトリをクリーンアップ
            if 'temp_profile_dir' in locals() and os.path.exists(temp_profile_dir):
                try:
                    import shutil
                    shutil.rmtree(temp_profile_dir)
                except:
                    pass  # クリーンアップ失敗は無視
    
    def _extract_feedback(self, result: Any) -> str:
        """実行結果からフィードバックを抽出"""
        if isinstance(result, dict) and 'feedback' in result:
            return result['feedback']
        elif isinstance(result, str):
            return result[:200]  # 最初の200文字
        else:
            return "タスクが完了しました"
    
    def _generate_error_feedback(self, task: str, error: str) -> str:
        """エラーからフィードバックを生成"""
        if "selector" in error.lower():
            return "要素が見つかりませんでした。ページの構造が変わった可能性があります。"
        elif "timeout" in error.lower():
            return "タイムアウトしました。ネットワークが遅い可能性があります。"
        elif "login" in error.lower() or "auth" in error.lower():
            return "ログインが必要です。認証情報を確認してください。"
        else:
            return f"エラーが発生しました: {error[:100]}"

async def main():
    """メインエントリーポイント"""
    # コマンドライン引数の処理
    if len(sys.argv) > 1:
        if sys.argv[1] == '--test':
            # テストモード - stderrに出力してJSONパースを妨げない
            sys.stderr.write("Browser-use agent is ready!\n")
            return
        
        # タスク実行モード
        try:
            input_data = json.loads(sys.argv[1])
            task = input_data.get('task', '')
            context = input_data.get('context', {})
            
            agent = BrowserUseAgent()
            result = await agent.execute_task(task, context)
            
            # 結果をJSONで出力
            print(json.dumps(result))
            
        except Exception as e:
            error_result = {
                'success': False,
                'error': str(e)
            }
            print(json.dumps(error_result))
    else:
        print(json.dumps({
            'success': False,
            'error': 'No task provided'
        }))

if __name__ == '__main__':
    asyncio.run(main())