import { MCPClientService } from './mcpClientService';
import { EncryptionService } from './encryptionService';

export interface ExaSearchResult {
  title: string;
  url: string;
  snippet?: string;
  score?: number;
  publishedDate?: string;
  author?: string;
}

export interface ExaConnectionOptions {
  mode: 'local' | 'remote';
  remoteUrl?: string;
}

export class ExaMCPService extends MCPClientService {
  private encryptionService: EncryptionService;
  private connectionMode: 'local' | 'remote' = 'local';
  
  constructor(encryptionService: EncryptionService) {
    super();
    this.encryptionService = encryptionService;
  }

  async connectToExa(options?: ExaConnectionOptions) {
    // Get Exa API key from encrypted storage
    const exaApiKey = await this.encryptionService.getExaApiKey();
    if (!exaApiKey) {
      throw new Error('Exa API key not found. Please set it in settings.');
    }

    const mode = options?.mode || 'local';
    this.connectionMode = mode;

    if (mode === 'remote' && options?.remoteUrl) {
      // Connect to remote MCP server via WebSocket
      await this.connectToRemoteServer(options.remoteUrl);
      console.log('🌐 Connected to Remote Exa MCP Server at:', options.remoteUrl);
    } else {
      // Connect to Exa remote MCP server
      await this.connectToServer(
        'npx',
        ['-y', 'mcp-remote', `https://mcp.exa.ai/mcp?exaApiKey=${exaApiKey}`],
        {}
      );
      console.log('🔍 Connected to Local Exa MCP Server');
    }
    
    // List available tools for debugging (commented out to reduce noise)
    // const tools = await this.listTools();
    // console.log('📋 Exa MCP Tools available:', tools.map(t => t.name));
  }

  async searchWeb(query: string, options?: {
    numResults?: number;
    includeDomains?: string[];
    excludeDomains?: string[];
  }): Promise<ExaSearchResult[]> {
    try {
      console.log('🔍 Searching web with Exa:', query);
      
      const args: any = {
        query,
        numResults: options?.numResults || 10
      };
      
      if (options?.includeDomains) {
        args.include_domains = options.includeDomains;
      }
      
      if (options?.excludeDomains) {
        args.exclude_domains = options.excludeDomains;
      }
      
      const response = await this.callTool('web_search_exa', args);
      
      // Parse and format results
      const results = this.parseSearchResults(response);
      console.log(`✅ Found ${results.length} search results`);
      
      return results;
    } catch (error) {
      console.error('❌ Error searching with Exa:', error);
      throw error;
    }
  }

  async searchResearchPapers(query: string): Promise<ExaSearchResult[]> {
    try {
      console.log('📚 Searching research papers:', query);
      const response = await this.callTool('research_paper_search', { query });
      return this.parseSearchResults(response);
    } catch (error) {
      console.error('❌ Error searching research papers:', error);
      throw error;
    }
  }

  async searchCompanyInfo(companyName: string): Promise<any> {
    try {
      console.log('🏢 Searching company information:', companyName);
      const response = await this.callTool('company_research', { 
        company_name: companyName 
      });
      return response;
    } catch (error) {
      console.error('❌ Error searching company info:', error);
      throw error;
    }
  }

  async crawlUrl(url: string): Promise<string> {
    try {
      console.log('🌐 Crawling URL:', url);
      const response = await this.callTool('crawling', { url });
      return response.content || response.text || '';
    } catch (error) {
      console.error('❌ Error crawling URL:', error);
      throw error;
    }
  }

  async searchWikipedia(topic: string): Promise<ExaSearchResult[]> {
    try {
      console.log('📖 Searching Wikipedia:', topic);
      const response = await this.callTool('wikipedia_search_exa', { 
        topic 
      });
      return this.parseSearchResults(response);
    } catch (error) {
      console.error('❌ Error searching Wikipedia:', error);
      throw error;
    }
  }

  async findCompetitors(companyName: string): Promise<any> {
    try {
      console.log('🔍 Finding competitors for:', companyName);
      const response = await this.callTool('competitor_finder', { 
        company_name: companyName 
      });
      return response;
    } catch (error) {
      console.error('❌ Error finding competitors:', error);
      throw error;
    }
  }

  async searchLinkedIn(query: string, type: 'people' | 'companies' = 'people'): Promise<any> {
    try {
      console.log('💼 Searching LinkedIn:', query, type);
      const response = await this.callTool('linkedin_search', { 
        query,
        search_type: type
      });
      return response;
    } catch (error) {
      console.error('❌ Error searching LinkedIn:', error);
      throw error;
    }
  }

  private parseSearchResults(response: any): ExaSearchResult[] {
    // Handle error responses first
    if (response.isError || (response.content && response.content[0]?.text?.startsWith('Search error'))) {
      console.error('❌ Search error response:', response);
      // Return empty array instead of trying to parse error message
      return [];
    }
    
    // Handle different response formats from Exa
    if (response.content) {
      // Tool response format
      try {
        let contentToParse = response.content;
        
        // Handle array format with text property
        if (Array.isArray(response.content) && response.content.length > 0) {
          const firstContent = response.content[0];
          if (firstContent.type === 'text' && firstContent.text) {
            contentToParse = firstContent.text;
          }
        }
        
        // Skip JSON parsing if it's an error message
        if (typeof contentToParse === 'string' && contentToParse.startsWith('Search error')) {
          console.error('❌ Search error:', contentToParse);
          return [];
        }
        
        const parsed = typeof contentToParse === 'string' 
          ? JSON.parse(contentToParse) 
          : contentToParse;
        
        if (Array.isArray(parsed)) {
          return parsed;
        } else if (parsed.results && Array.isArray(parsed.results)) {
          return parsed.results;
        } else if (parsed.data && Array.isArray(parsed.data)) {
          return parsed.data;
        }
      } catch (e) {
        console.warn('Failed to parse response content:', e);
      }
    }
    
    // Direct array response
    if (Array.isArray(response)) {
      return response;
    }
    
    // Response with results property
    if (response.results && Array.isArray(response.results)) {
      return response.results;
    }
    
    console.warn('Unexpected response format:', response);
    return [];
  }
}