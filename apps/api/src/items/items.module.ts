import { Module } from "@nestjs/common";
import { ItemsController } from "./items.controller";
import { ItemsService } from "./items.service";
import { StorageModule } from "../storage/storage.module";
import { SearchModule } from "../search/search.module";

@Module({
  imports: [StorageModule, SearchModule],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
