from django.conf.urls import url

urlpatterns = [
    url(r'^$', 'flashcards.views.load'),
]
