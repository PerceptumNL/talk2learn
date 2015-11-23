from django.conf.urls import url

urlpatterns = [
    url(r'^$', 'flashcards.views.load', name='load'),
    url(r'^collections/?$', 'flashcards.views.get_collections',
        name='get_collections'),
    url(r'^collections/(?P<collection_id>[^/]+)/?$',
        'flashcards.views.get_card', name='get_card'),
    url(r'^collections/(?P<collection_id>[^/]+)/check/?$',
        'flashcards.views.check_card', name='check_card'),
]
