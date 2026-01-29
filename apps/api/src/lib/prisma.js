/**
 * PrismaClient シングルトン
 *
 * 全ファイルで共有する単一インスタンスを提供する。
 * 複数の new PrismaClient() はコネクションプール枯渇の原因になる。
 */
import { PrismaClient } from '../generated/prisma/index.js';

const prisma = new PrismaClient();

export default prisma;
