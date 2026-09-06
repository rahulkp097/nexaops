import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { RequestUser } from '../auth/types/request-user.type';
import { DocumentsService } from './documents.service';
import { DocumentResponseDto } from './dto/document-response.dto';

@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Roles('ADMIN')
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.upload(file, user);
  }

  @Roles('ADMIN')
  @Get()
  list(@CurrentUser() user: RequestUser): Promise<DocumentResponseDto[]> {
    return this.documentsService.list(user.organizationId);
  }

  @Roles('ADMIN')
  @Get(':id')
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.getOne(id, user.organizationId);
  }

  @Roles('ADMIN')
  @HttpCode(204)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: RequestUser): Promise<void> {
    return this.documentsService.remove(id, user);
  }

  @Roles('ADMIN')
  @HttpCode(200)
  @Post(':id/reindex')
  reindex(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
  ): Promise<DocumentResponseDto> {
    return this.documentsService.reindex(id, user);
  }
}
