from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone
from datetime import timedelta


# Create your models here.

class UserProfile(models.Model):
    user = models.OneToOneField(
        User,
        on_delete = models.CASCADE,
        related_name= "profile"
    )

    phone = models.CharField(max_length=15, blank=True, default='')
    is_phone_verified = models.BooleanField(default=False)
    is_email_verified = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = "User Profile"
        verbose_name_plural = "User Profiles"

    def __str__(self):
        return f"{self.user.email} — {self.phone or 'no phone'}"
    


class OTPAttempt(models.Model):
    """
    Tracks individual OTP requests to manage resend limits and expiration.
    Table name: companies_otpattempt
    """
    profile = models.ForeignKey(
        UserProfile, 
        on_delete=models.CASCADE, 
        related_name='otp_attempts'
    )
    otp_code = models.CharField(max_length=6)
    
    # Track the type (e.g., 'login', 'register', 'reset') if needed
    attempt_type = models.CharField(max_length=20, default='verification')
    
    # Metadata for rate limiting
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)

    class Meta:
        verbose_name = "OTP Attempt"
        verbose_name_plural = "OTP Attempts"
        ordering = ['-created_at']

    def __str__(self):
        return f"OTP for {self.profile.user.email} at {self.created_at}"

    def is_valid(self):
        """Checks if the OTP is still within its time window and not used."""
        return not self.is_used and timezone.now() < self.expires_at


class UserSettings(models.Model):
    # This creates the 'user_id' column that links to Django's auth_user
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='app_settings')
    company = models.ForeignKey('companies.TallyCompany',on_delete=models.CASCADE,related_name="user_settings")
    # JSONB columns handled by Django's JSONField
    ledger_config = models.JSONField(default=dict, blank=True)
    rate_wise_ledgers = models.JSONField(default=dict, blank=True)
    voucher_types = models.JSONField(default=dict, blank=True)
    invoices = models.JSONField(default=list, blank=True)
    mapping_status = models.JSONField(default=dict, blank=True)
    
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'user_settings'
        constraints = [
            models.UniqueConstraint(fields=['user', 'company'], name='unique_user_company_settings')
        ]