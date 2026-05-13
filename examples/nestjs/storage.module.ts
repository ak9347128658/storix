/**
 * NestJS integration example
 *
 * Provides StorageClient as a NestJS injectable service.
 */

import { Module, Injectable, Global, type OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { createStorage, type StorageClient } from 'storebridge';

// ---------------------------------------------------------------------------
// StorageService — wraps the StoreBridge client
// ---------------------------------------------------------------------------

@Injectable()
export class StorageService implements OnModuleInit {
  private client!: StorageClient;

  constructor(private readonly config: ConfigService) {}

  async onModuleInit(): Promise<void> {
    this.client = await createStorage({
      provider: 'azure',
      credentials: {
        accountName: this.config.getOrThrow<string>('AZURE_ACCOUNT_NAME'),
        accountKey: this.config.getOrThrow<string>('AZURE_ACCOUNT_KEY'),
        containerName: this.config.getOrThrow<string>('AZURE_CONTAINER_NAME'),
      },
      visibility: 'private',
    });

    // Add metadata middleware
    this.client.use(async (ctx, next) => {
      ctx.options.metadata = {
        ...ctx.options.metadata,
        app: 'nestjs-example',
        uploadedAt: new Date().toISOString(),
      };
      await next();
    });
  }

  get storage(): StorageClient {
    return this.client;
  }
}

// ---------------------------------------------------------------------------
// StorageModule — global so it can be injected anywhere
// ---------------------------------------------------------------------------

@Global()
@Module({
  imports: [ConfigModule],
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}

// ---------------------------------------------------------------------------
// Example Controller usage
// ---------------------------------------------------------------------------

import {
  Controller,
  Post,
  Get,
  Delete,
  Query,
  UploadedFile,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string },
  ): Promise<{ key: string; url: string }> {
    const key = `uploads/${Date.now()}-${file.originalname}`;
    const result = await this.storageService.storage.upload({
      key,
      file: file.buffer,
      contentType: file.mimetype,
    });
    return { key: result.key, url: result.url };
  }

  @Get('signed-url')
  async getSignedUrl(@Query('key') key: string): Promise<{ url: string }> {
    const url = await this.storageService.storage.getSignedUrl(key, { expiresIn: 3600 });
    return { url };
  }

  @Delete(':key(*)')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteFile(@Param('key') key: string): Promise<void> {
    await this.storageService.storage.delete({ key });
  }
}
