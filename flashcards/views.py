"""
Module containing views for the flashcards application.
"""
from django.shortcuts import render, get_object_or_404
from django.core.urlresolvers import reverse
from django.http import HttpResponse, JsonResponse
from urllib.parse import quote
from .models import *

import random

def load(request):
    """
    Render the index page for the flashcards app.

    :param request: Incoming request.
    :type request: :py:class:`django.http.HttpRequest`
    :return: Rendered html in a HttpResponse
    :rtype: :py:class:`django.http.HttpResponse`
    """
    return render(request, 'flashcards/index.html', {})

def get_collections(request):
    """
    Return a JSON list of collection objects.

    A collection is described as a dictionary containing the keys `id`, `title`
    and `card`, where the identifier (i.e. id) and title are both strings, and
    card is an URL pointing to the service that produces cards that belong to
    the collection. The identifier can be used to refer to the collection in
    other requests.

    :param request: Incoming request.
    :type request: :py:class:`django.http.HttpRequest`
    :return: List of collection dictionaries, serialized in JSON.
    :rtype: :py:class:`django.http.JsonResponse`
    """
    descriptor = (lambda c: {
        "id": str(c.pk),
        "title": c.title,
        "card": reverse('get_card', args=(c.pk,))})

    return JsonResponse([descriptor(c) \
            for c in Collection.objects.filter(active=True)], safe=False)

def get_card(request, collection_id):
    """
    Return a card from the collection refered to by `colllection_id`.

    A card is described as a dictionary containing the keys `id`, `question`
    and `check`, where the identifier (i.e. id) and question are both strings,
    and check is the URL denoting the service that can check if a provided
    answer matches the back of the card. The identifier can be used to refer to
    the collection in other requests.

    :param request: Incoming request.
    :type request: :py:class:`django.http.HttpRequest`
    :param str collection_id: Identifier of the desired card's collection.
    :return: Dictionary describing the card, serialized in JSON.
    :rtype: :py:class:`django.http.JsonResponse`
    """
    collection = get_object_or_404(Collection, pk=collection_id)
    generator = collection.generator
    for GeneratorClass in CardGenerator.__subclasses__():
        if generator == GeneratorClass.__name__:
            try:
                card = GeneratorClass.get_card(request=request,
                                               collection=collection)
                card['check'] = "%s?card_id=%s" % (
                    reverse("check_card", args=(collection_id,)),
                    quote(str(card['id']), safe=""))
                return JsonResponse(card)
            except Exception as error:
                return HttpResponse("Cannot generate card: %s" % (error,),
                                    status=500)
            else:
                break
    else:
        return HttpResponse("Cannot generate card: unknown generator",
                            status=500)

def check_card(request, collection_id):
    """"
    Return whether the back of the card denoted by `card_id` matches the
    `answer` given by the user.

    :param request: Incoming request.
    :type request: :py:class:`django.http.HttpRequest`
    :param str collection_id: Identifier of the desired card's collection.
    :return: ``True`` if the answer matches, else ``False``, serialized in JSON.
    """
    card_id = request.GET.get('card_id')
    if card_id is None:
        return HttpResponse("Missing `card_id` in query params", status=400)
    answer = request.POST.get('answer')
    if answer is None:
        return HttpResponse("Missing `answer' in payload", status=400)

    collection = get_object_or_404(Collection, pk=collection_id)
    generator = collection.generator
    for GeneratorClass in CardGenerator.__subclasses__():
        if generator == GeneratorClass.__name__:
            try:
                return JsonResponse(
                    GeneratorClass.check_card(
                        request=request,
                        card_id=card_id,
                        answer=answer),
                    safe=False)
            except Exception as error:
                return HttpResponse("Cannot check card: %s" % (error,),
                                    status=500)
            else:
                break
    else:
        return HttpResponse("Cannot check card: unknown generator", status=500)


class CardGenerator(object):
    """
    Generator for cards within a collection. Subclasses of this class can be
    used by the :py:func:`get_card` dispatcher.
    """

    @classmethod
    def get_card(cls, request, collection):
        """
        Return a JSON-serializable dictionary describing a card in the given
        `collection`.

        :param request: Incoming request.
        :type request: :py:class:`django.http.HttpRequest`
        :param collection: Collection from which the card must be generated.
        :type collection: :py:class:`flashcards.models.Collection`
        :return: Card dictionary containing `id` and `question`
        :rtype: dict
        """
        raise NotImplementedError()

    @classmethod
    def check_card(cls, request, card_id, answer):
        """"
        Return whether the back of the card denoted by `card_id` matches the
        `answer` given by the user.

        :param request: Incoming request.
        :type request: :py:class:`django.http.HttpRequest`
        :param str card_id: Identifier of the card that was answered
        :param str answer: The answer given in reaction to the card.
        :return: ``True`` if the answer matches, else ``False``.
        """
        raise NotImplementedError()


class RandomCardGenerator(CardGenerator):
    """
    Generator for a card selected randomly from the collection.
    """

    @classmethod
    def get_card(cls, collection, **kwargs):
        """
        Return a random pre-defined card from the `collection`.

        A random :py:class:`flashcards.models.Card` instance is selected. The
        returning dictionary contains the card's `id` and `front` attributes.
        This function can be called by the :py:func:`get_card` dispatcher.

        :param collection: Collection from which the card must be drawn.
        :type collection: :py:class:`flashcards.models.Collection`
        :return: Card dictionary containing `id` and `question`
        :rtype: dict
        """
        card = random.choice(list(collection.card_set.all()))
        return {"id": card.pk, "question": card.front}

    @classmethod
    def check_card(cls, card_id, answer, **kwargs):
        """
        Return whether the card denoted by `card_id` matches `answer`.

        The match is determined by the method
        :py:meth:`flashcards.models.Card.compare_answer`.

        :param str card_id: Identifier of the card that was answered
        :param str answer: The answer given in reaction to the card.
        :return: ``True`` if the answer matches, else ``False``.
        """
        card = get_object_or_404(Card, pk=card_id)
        return card.compare_answer(answer)


class ArithmiticCardMixin(object):
    """
    Mixin defining :py:meth:`CardGenerator.check_card` for any card generator
    that creates cards with arithmitic exercises.
    """

    @classmethod
    def check_card(cls, card_id, answer, **kwargs):
        """
        Return whether the card denoted by `card_id` matches `answer`.

        The match is determined by comparing the answer to an evaluation of the
        identifier. The evaluation is performed using :py:func:`eval` with an
        empty local scope and an explicitly cleared global scope.

        :param str card_id: Identifier of the card that was answered, which
                            will be eval'ed to retrieve the correct answer.
        :param str answer: The answer given in reaction to the card.
        :return: ``True`` if the answer matches, else ``False``.
        """
        # Evaluate the card identifier to get the correct answer, but ensure
        #   that the global context is cleared for security purposes.
        correct_answer = eval(card_id, {'__builtins__': {}})
        if isinstance(correct_answer, int):
            return int(answer) == correct_answer
        elif isinstance(correct_answer, float):
            return float(answer) == correct_answer
        else:
            raise ValueError('Unexpected generated answer')

class SimpleAdditionCardGenerator(ArithmiticCardMixin, CardGenerator):
    """
    Generator for cards with simple addition exercises. The addition always
    contains two integers between 1 and 10, inclusive.
    """

    @classmethod
    def get_card(cls, **kwargs):
        """
        Return a card containing a simple addition.

        :return: Card dictionary containing `id` and `question`
        :rtype: dict
        """
        numbers = (random.randint(1, 10), random.randint(1, 10))
        identifier = "%d+%d" % numbers
        question = "%d + %d" % numbers
        return {"id": identifier, "question": question}


class SimpleMultiplicationCardGenerator(ArithmiticCardMixin, CardGenerator):
    """
    Generator for cards with simple multiplication exercises. The addition
    always contains two integers between 1 and 10, inclusive.
    """

    @classmethod
    def get_card(cls, **kwargs):
        """
        Return a card containing a simple multiplication.

        :return: Card dictionary containing `id` and `question`
        :rtype: dict
        """
        numbers = (random.randint(1, 10), random.randint(1, 10))
        identifier = "%d*%d" % numbers
        question = "%d * %d" % numbers
        return {"id": identifier, "question": question}


class SimpleDivisionCardGenerator(ArithmiticCardMixin, CardGenerator):
    """
    Generator for cards with simple division exercises. The addition
    always contains two integers between 1 and 10, inclusive.
    """

    @classmethod
    def get_card(cls, **kwargs):
        """
        Return a card containing a simple division.

        :return: Card dictionary containing `id` and `question`
        :rtype: dict
        """
        numbers = (random.randint(1, 10), random.randint(1, 10))
        identifier = "%d/%d" % numbers
        question = "%d / %d" % numbers
        return {"id": identifier, "question": question}
