import os
from django.core.management.base import BaseCommand, CommandError
from wirewizard.models import WizExample

class Command(BaseCommand):
    help = 'Builds the examples collection in the DB.'

    def handle(self, *args, **options):
        WizExample.objects.all().delete()
        for subdir, dirs, files in os.walk(args[0]):
            for f in files:
                if f.endswith('.json'):
                    with open(subdir + f) as infile:
                        print f
                        e = WizExample()
                        e.name = f[:-5]
                        e.design = infile.read()
                        e.default = f == 'ieee_2013.json'
                        e.save()
