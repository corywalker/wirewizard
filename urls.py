from django.conf.urls import url, patterns

urlpatterns = patterns('',
    url(r'^$', 'wirewizard.views.index', name='index'),
    url(r'^info/$', 'wirewizard.views.info', name='info'),
    url(r'^graphic/(?P<identifier>[^/]+)/$', 'wirewizard.views.get_graphic', name='index'),
    url(r'^examples/$', 'wirewizard.views.examples', name='examples'),
)
