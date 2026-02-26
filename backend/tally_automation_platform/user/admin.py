from django.contrib import admin
from .models import UserProfile, OTPAttempt

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