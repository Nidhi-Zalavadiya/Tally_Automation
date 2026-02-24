from django.contrib import admin
from .models import TallyCompany, ProductMapping

# Register your models here.
@admin.register(TallyCompany)
class TallyCompanyAdmin(admin.ModelAdmin):
    list_display = ('company_name', 'user', 'connected_at')

@admin.register(ProductMapping)
class ProductMappingAdmin(admin.ModelAdmin):
    list_display = ('json_description', 'tally_item_name', 'company')
    search_fields = ('json_description', 'tally_item_name')