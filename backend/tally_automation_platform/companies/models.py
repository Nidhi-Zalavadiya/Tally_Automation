from django.db import models
from django.contrib.auth.models import User
# Create your models here.

class TallyCompany(models.Model):
    '''
    Stores Connected companies to tally by user
    '''
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='tally_companies')
    company_name = models.CharField(max_length=255)
    connected_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Tally Companies"
        unique_together = ('user','company_name')
    
    def __str__(self):
        return self.company_name
    
class ProductMapping(models.Model):
    '''
        Stores: Json Description -> Tally Stock Item name
    '''
    company = models.ForeignKey(TallyCompany, on_delete=models.CASCADE, related_name='Mappings')
    json_description = models.TextField()
    tally_item_name = models.CharField(max_length=255)
    last_sales_rate = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    mrp = models.DecimalField(max_digits=15, decimal_places=2, null=True, blank=True)
    updated_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ('company', 'json_description')

    def __str__(self):
        return f"{self.json_description} -> {self.tally_item_name}"