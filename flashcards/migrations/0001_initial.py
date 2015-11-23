# -*- coding: utf-8 -*-
from __future__ import unicode_literals

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
    ]

    operations = [
        migrations.CreateModel(
            name='Card',
            fields=[
                ('id', models.AutoField(serialize=False, auto_created=True, verbose_name='ID', primary_key=True)),
                ('front', models.CharField(max_length=255)),
                ('back', models.CharField(max_length=255)),
                ('answer_type', models.CharField(max_length=3, default='str', choices=[('str', 'Text'), ('num', 'Numerical'), ('dec', 'Decimal')])),
            ],
        ),
        migrations.CreateModel(
            name='Collection',
            fields=[
                ('id', models.AutoField(serialize=False, auto_created=True, verbose_name='ID', primary_key=True)),
                ('active', models.BooleanField(default=True)),
                ('title', models.CharField(max_length=255)),
                ('generator', models.CharField(max_length=255, default='RandomCardGenerator')),
            ],
        ),
        migrations.AddField(
            model_name='card',
            name='collection',
            field=models.ForeignKey(to='flashcards.Collection'),
        ),
    ]
