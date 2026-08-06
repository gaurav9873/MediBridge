import { Controller, Get, Query } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'
import { type SessionUser, UserRole, medicineSearchSchema } from '@medibridge/types'
import { CurrentUser, Roles } from '../auth/auth.guard'
import { SearchService, type SearchResult } from './search.service'

@ApiTags('Search')
@Roles(UserRole.RETAILER, UserRole.ADMIN)
@Controller('search')
export class SearchController {
  constructor(private readonly search: SearchService) {}

  @Get('medicines')
  @ApiOperation({ summary: 'Search medicines available from distributors near you' })
  medicines(
    @Query() rawQuery: Record<string, string>,
    @CurrentUser() user: SessionUser,
  ): Promise<SearchResult> {
    const input = medicineSearchSchema.parse(rawQuery)
    return this.search.search(user.id, input)
  }
}
