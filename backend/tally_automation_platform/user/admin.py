from django.contrib import admin
from .models import UserProfile, OTPAttempt, UserSettings

class OTPAttemptInline(admin.TabularInline):
    model = OTPAttempt
    extra = 0  # Prevents empty extra rows
    readonly_fields = ('otp_code', 'attempt_type', 'is_used', 'created_at', 'expires_at')
    can_delete = False # Keeps the log intact

@admin.register(UserProfile)
class UserAdminProfile(admin.ModelAdmin):
    list_display = ('user', 'phone', 'is_phone_verified', 'is_email_verified', 'created_at')
    list_filter = ('is_phone_verified', 'is_email_verified')
    search_fields = ('user__email', 'phone')
    readonly_fields = ('created_at', 'updated_at')
    
    # This adds the OTP history to the bottom of the User Profile page
    inlines = [OTPAttemptInline]

@admin.register(OTPAttempt)
class OTPAttemptAdmin(admin.ModelAdmin):
    list_display = ('profile', 'otp_code', 'attempt_type', 'is_used', 'created_at', 'expires_at')
    list_filter = ('is_used', 'attempt_type', 'created_at')
    search_fields = ('profile__user__email', 'otp_code')
    readonly_fields = ('created_at',)


@admin.register(UserSettings)
class UserSettingsAdmin(admin.ModelAdmin):
    # Display the user and the time they last saved their settings
    list_display = ('user', 'updated_at', 'get_invoice_count')
    search_fields = ('user__username', 'user__email')
    readonly_fields = ('updated_at',)
    
    # Organize the JSON data into sections (Fieldsets)
    fieldsets = (
        (None, {
            'fields': ('user', 'updated_at')
        }),
        ('Tally Configuration', {
            'fields': ('ledger_config', 'rate_wise_ledgers', 'voucher_types'),
            'description': 'JSON data for Tally ledger and voucher mappings'
        }),
        ('Invoice State', {
            'fields': ('invoices', 'mapping_status'),
            'description': 'Current uploaded invoices and their mapping progress'
        }),
    )

    # Helper to show how many invoices are saved without opening the record
    def get_invoice_count(self, obj):
        if isinstance(obj.invoices, list):
            return len(obj.invoices)
        return 0
    get_invoice_count.short_description = 'Saved Invoices'