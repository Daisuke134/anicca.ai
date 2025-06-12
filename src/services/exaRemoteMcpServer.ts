import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { JSONRPCMessage, ErrorCode, JSONRPCError } from '@modelcontextprotocol/sdk/types.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import WebSocket from 'ws';
import http from 'http';
import Exa from 'exa-js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';

// WebSocket Transport implementation for MCP Server
class WebSocketServerTransport implements Transport {
  private ws: WebSocket;
  
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  constructor(ws: WebSocket) {
    this.ws = ws;
    
    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        if (this.onmessage) {
          this.onmessage(message);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
        if (this.onerror) {
          this.onerror(error as Error);
        }
      }
    });

    this.ws.on('close', () => {
      if (this.onclose) {
        this.onclose();
      }
    });

    this.ws.on('error', (error) => {
      if (this.onerror) {
        this.onerror(error);
      }
    });
  }

  async start(): Promise<void> {
    // WebSocket is already connected
  }

  async send(message: JSONRPCMessage): Promise<void> {
    if (this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      throw new Error('WebSocket is not open');
    }
  }

  async close(): Promise<void> {
    this.ws.close();
  }
}

interface ExaServerConfig {
  port: number;
  apiKey: string;
}

export class ExaRemoteMCPServer {
  private server: Server;
  private httpServer: http.Server;
  private wss: WebSocket.Server;
  private exaClient: Exa;
  private config: ExaServerConfig;

  constructor(config: ExaServerConfig) {
    this.config = config;
    this.exaClient = new Exa(config.apiKey);
    
    // Initialize MCP server
    this.server = new Server(
      {
        name: 'exa-remote-mcp',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    // Setup HTTP server
    this.httpServer = http.createServer();
    this.wss = new WebSocket.Server({ server: this.httpServer });

    this.setupHandlers();
    this.setupWebSocketServer();
  }

  private setupHandlers() {
    // Register tool listing handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'web_search_exa',
          description: 'Search the web using Exa search engine',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              numResults: {
                type: 'number',
                description: 'Number of results to return',
                default: 10,
              },
              includeDomains: {
                type: 'array',
                items: { type: 'string' },
                description: 'Domains to include in search',
              },
              exclude_domains: {
                type: 'array',
                items: { type: 'string' },
                description: 'Domains to exclude from search',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'research_paper_search',
          description: 'Search for research papers',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Research topic or keywords',
              },
            },
            required: ['query'],
          },
        },
        {
          name: 'company_research',
          description: 'Search for company information',
          inputSchema: {
            type: 'object',
            properties: {
              company_name: {
                type: 'string',
                description: 'Name of the company',
              },
            },
            required: ['company_name'],
          },
        },
        {
          name: 'crawling',
          description: 'Crawl a specific URL to get its content',
          inputSchema: {
            type: 'object',
            properties: {
              url: {
                type: 'string',
                description: 'URL to crawl',
              },
            },
            required: ['url'],
          },
        },
        {
          name: 'wikipedia_search_exa',
          description: 'Search Wikipedia for a specific topic',
          inputSchema: {
            type: 'object',
            properties: {
              topic: {
                type: 'string',
                description: 'Topic to search on Wikipedia',
              },
            },
            required: ['topic'],
          },
        },
        {
          name: 'competitor_finder',
          description: 'Find competitors for a given company',
          inputSchema: {
            type: 'object',
            properties: {
              company_name: {
                type: 'string',
                description: 'Name of the company',
              },
            },
            required: ['company_name'],
          },
        },
        {
          name: 'linkedin_search',
          description: 'Search LinkedIn for people or companies',
          inputSchema: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'Search query',
              },
              search_type: {
                type: 'string',
                enum: ['people', 'companies'],
                description: 'Type of search',
                default: 'people',
              },
            },
            required: ['query'],
          },
        },
      ],
    }));

    // Register tool call handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'web_search_exa':
            return await this.handleWebSearch(args);
          
          case 'research_paper_search':
            return await this.handleResearchPaperSearch(args);
          
          case 'company_research':
            return await this.handleCompanyResearch(args);
          
          case 'crawling':
            return await this.handleCrawling(args);
          
          case 'wikipedia_search_exa':
            return await this.handleWikipediaSearch(args);
          
          case 'competitor_finder':
            return await this.handleCompetitorFinder(args);
          
          case 'linkedin_search':
            return await this.handleLinkedInSearch(args);
          
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        console.error(`Error calling tool ${name}:`, error);
        throw error;
      }
    });
  }

  private async handleWebSearch(args: any) {
    const searchOptions: any = {
      numResults: args.numResults || 10,
    };

    if (args.includeDomains) {
      searchOptions.includeDomains = args.includeDomains;
    }

    if (args.exclude_domains) {
      searchOptions.exclude_domains = args.exclude_domains;
    }

    const results = await this.exaClient.search(args.query, searchOptions);
    
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private async handleResearchPaperSearch(args: any) {
    // Use Exa search with academic filters
    const results = await this.exaClient.search(args.query, {
      numResults: 10,
      type: 'neural',
      includeDomains: ['arxiv.org', 'scholar.google.com', 'pubmed.ncbi.nlm.nih.gov'],
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private async handleCompanyResearch(args: any) {
    const results = await this.exaClient.search(
      `${args.company_name} company profile overview`,
      {
        numResults: 10,
        type: 'neural',
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private async handleCrawling(args: any) {
    // Get content of a specific URL
    const result = await this.exaClient.getContents([args.url]);
    
    return {
      content: [
        {
          type: 'text',
          text: result.results[0]?.text || '',
        },
      ],
    };
  }

  private async handleWikipediaSearch(args: any) {
    const results = await this.exaClient.search(
      `${args.topic} site:wikipedia.org`,
      {
        numResults: 5,
        type: 'keyword',
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private async handleCompetitorFinder(args: any) {
    const results = await this.exaClient.search(
      `${args.company_name} competitors alternatives similar companies`,
      {
        numResults: 10,
        type: 'neural',
      }
    );

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private async handleLinkedInSearch(args: any) {
    const searchType = args.search_type || 'people';
    const searchQuery = searchType === 'people' 
      ? `${args.query} site:linkedin.com/in/`
      : `${args.query} site:linkedin.com/company/`;

    const results = await this.exaClient.search(searchQuery, {
      numResults: 10,
      type: 'keyword',
    });

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(results.results),
        },
      ],
    };
  }

  private setupWebSocketServer() {
    this.wss.on('connection', (ws: WebSocket) => {
      console.log('New WebSocket connection established');
      
      const transport = new WebSocketServerTransport(ws);
      this.server.connect(transport);

      ws.on('close', () => {
        console.log('WebSocket connection closed');
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
    });
  }

  async start() {
    return new Promise<void>((resolve) => {
      this.httpServer.listen(this.config.port, () => {
        console.log(`Exa Remote MCP Server listening on ws://localhost:${this.config.port}`);
        resolve();
      });
    });
  }

  async stop() {
    return new Promise<void>((resolve) => {
      this.wss.close(() => {
        this.httpServer.close(() => {
          console.log('Exa Remote MCP Server stopped');
          resolve();
        });
      });
    });
  }
}

// Export a function to start the server
export async function startExaRemoteMCPServer(port: number, apiKey: string) {
  const server = new ExaRemoteMCPServer({ port, apiKey });
  await server.start();
  return server;
}