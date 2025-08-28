export default async function handler(req, res) {
  // CORS設定
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // 両方の形式に対応
    let limit = 5;
    
    console.log('📥 Request body:', JSON.stringify(req.body, null, 2));
    
    if (req.body.arguments) {
      // デスクトップ版形式: { arguments: { limit: 5 } }
      const args = typeof req.body.arguments === 'string' 
        ? JSON.parse(req.body.arguments) 
        : req.body.arguments;
      limit = args.limit || 5;
      console.log('🔧 Using arguments format - limit:', limit);
    } else {
      // Web版形式: { limit: 5 }
      limit = req.body.limit || 5;
      console.log('🔧 Using direct format - limit:', limit);
    }
    
    // HackerNews APIから最新ストーリーを取得
    const topStoriesResponse = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json');
    const storyIds = await topStoriesResponse.json();
    console.log(`📰 Fetched ${storyIds.length} story IDs from HackerNews`);
    
    const limitedIds = storyIds.slice(0, limit);
    
    // 各ストーリーの詳細を取得
    const stories = await Promise.all(
      limitedIds.map(async (id) => {
        const storyResponse = await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`);
        const story = await storyResponse.json();
        return {
          title: story.title,
          url: story.url || `https://news.ycombinator.com/item?id=${id}`,
          score: story.score,
          by: story.by,
          time: new Date(story.time * 1000).toISOString()
        };
      })
    );
    
    const responseData = {
      success: true,
      stories: stories
    };
    
    console.log('✅ Returning response with', stories.length, 'stories');
    console.log('📤 Response:', JSON.stringify(responseData, null, 2));
    
    res.status(200).json(responseData);
    
  } catch (error) {
    console.error('HackerNews API Error:', error);
    res.status(500).json({
      error: 'Failed to fetch HackerNews stories',
      message: error.message
    });
  }
}