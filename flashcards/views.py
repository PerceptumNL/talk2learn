from django.shortcuts import render

def load(request):
    return render(request, 'flashcards/index.html', {})
