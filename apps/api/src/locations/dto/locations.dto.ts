import { createZodDto } from "nestjs-zod";
import { createFolderSchema, createLocationSchema, createSpotSchema } from "@maintnote/shared";

export class CreateLocationDto extends createZodDto(createLocationSchema) {}
export class CreateFolderDto extends createZodDto(createFolderSchema) {}
export class CreateSpotDto extends createZodDto(createSpotSchema) {}
