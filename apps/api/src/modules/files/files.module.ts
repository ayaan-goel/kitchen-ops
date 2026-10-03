import { Global, Module } from '@nestjs/common';
import { FileStore } from './file-store';
import { FilesController } from './files.controller';

@Global()
@Module({
  controllers: [FilesController],
  providers: [FileStore],
  exports: [FileStore],
})
export class FilesModule {}
