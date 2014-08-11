from django.db import models

class WizExample(models.Model):
    design = models.TextField()
    name = models.CharField(max_length=40)
    default = models.BooleanField()
    created = models.DateTimeField(auto_now_add=True)
