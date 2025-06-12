import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: any;
}

export interface MCPResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export class MCPClientService extends EventEmitter {
  private client: Client | null = null;
  private transport: StdioClientTransport | WebSocketClientTransport | null = null;
  private serverProcess: ChildProcess | null = null;
  private isConnected: boolean = false;

  constructor() {
    super();
  }

  async connectToServer(command: string, args: string[], env?: Record<string, string>) {
    try {
      console.log('🔌 Connecting to MCP server:', command, args);
      
      // Initialize client
      this.client = new Client(
        { 
          name: 'ANICCA-MCP-Client', 
          version: '1.0.0' 
        },
        { 
          capabilities: { 
            tools: {}, 
            resources: {}, 
            prompts: {} 
          } 
        }
      );

      // Create stdio transport
      const transportEnv: Record<string, string> = {};
      
      // Copy process.env with proper type safety
      for (const [key, value] of Object.entries(process.env)) {
        if (value !== undefined) {
          transportEnv[key] = value;
        }
      }
      
      // Add custom env variables
      if (env) {
        Object.assign(transportEnv, env);
      }
      
      this.transport = new StdioClientTransport({
        command,
        args,
        env: transportEnv
      });

      // Connect to server
      await this.client.connect(this.transport);
      
      console.log('✅ Connected to MCP server');
      
      this.isConnected = true;
      this.emit('connected');
      
      // Set up error handling
      this.client.onerror = (error) => {
        console.error('❌ MCP Client Error:', error);
        this.emit('error', error);
      };
      
      this.transport.onerror = (error) => {
        console.error('❌ MCP Transport Error:', error);
        this.emit('error', error);
      };

    } catch (error) {
      console.error('❌ Failed to connect to MCP server:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async connectToRemoteServer(url: string) {
    try {
      console.log('🔌 Connecting to remote MCP server:', url);
      
      // Initialize client
      this.client = new Client(
        { 
          name: 'ANICCA-MCP-Client', 
          version: '1.0.0' 
        },
        { 
          capabilities: { 
            tools: {}, 
            resources: {}, 
            prompts: {} 
          } 
        }
      );

      // Create WebSocket transport
      this.transport = new WebSocketClientTransport(new URL(url));

      // Connect to server
      await this.client.connect(this.transport);
      
      console.log('✅ Connected to remote MCP server');
      
      this.isConnected = true;
      this.emit('connected');
      
      // Set up error handling
      this.client.onerror = (error) => {
        console.error('❌ MCP Client Error:', error);
        this.emit('error', error);
      };
      
      this.transport.onerror = (error) => {
        console.error('❌ MCP Transport Error:', error);
        this.emit('error', error);
      };

    } catch (error) {
      console.error('❌ Failed to connect to remote MCP server:', error);
      this.isConnected = false;
      throw error;
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP client not connected');
    }

    try {
      const response = await this.client.listTools();
      // console.log('🔧 Available tools:', response.tools); // ログ出力を抑制
      return response.tools || [];
    } catch (error) {
      console.error('❌ Error listing tools:', error);
      throw error;
    }
  }

  async callTool(name: string, args: any): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP client not connected');
    }

    try {
      console.log('🔨 Calling tool:', name, 'with args:', args);
      const response = await this.client.callTool({
        name,
        arguments: args
      });
      
      console.log('✅ Tool response:', response);
      return response;
    } catch (error) {
      console.error('❌ Error calling tool:', error);
      throw error;
    }
  }

  async listResources(): Promise<MCPResource[]> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP client not connected');
    }

    try {
      const response = await this.client.listResources();
      console.log('📁 Available resources:', response.resources);
      return response.resources || [];
    } catch (error) {
      console.error('❌ Error listing resources:', error);
      throw error;
    }
  }

  async readResource(uri: string): Promise<any> {
    if (!this.client || !this.isConnected) {
      throw new Error('MCP client not connected');
    }

    try {
      console.log('📖 Reading resource:', uri);
      const response = await this.client.readResource({ uri });
      return response;
    } catch (error) {
      console.error('❌ Error reading resource:', error);
      throw error;
    }
  }

  async disconnect() {
    console.log('🔌 Disconnecting from MCP server...');
    
    if (this.client) {
      try {
        await this.client.close();
      } catch (error) {
        console.error('❌ Error closing client:', error);
      }
    }

    if (this.transport) {
      try {
        await this.transport.close();
      } catch (error) {
        console.error('❌ Error closing transport:', error);
      }
    }

    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }

    this.client = null;
    this.transport = null;
    this.isConnected = false;
    
    console.log('✅ Disconnected from MCP server');
    this.emit('disconnected');
  }

  isServerConnected(): boolean {
    return this.isConnected;
  }
}