from django.db import models

class Collection(models.Model):
    """
    Model representing a collection of cards.

    A collection could have pre-defined :py:class:`Card` instances linked to
    it, but that does not have to be the case. The collection's generator
    provides members of the collection, which can also be dynamic.
    """

    active = models.BooleanField(default=True)
    """Whether or not the collection should be used."""

    title = models.CharField(max_length=255)
    """A descriptive title of the collection."""

    generator = models.CharField(max_length=255, default='RandomCardGenerator')
    """
    Name of the :py:class:`flashcards.views.CardGenerator` subclass that
    generates cards that belong to this collection.
    """

    def __str__(self):
        return self.title

    def __repr__(self):
        return "%s(%s)" % (self.__class__.__name__, self)


class Card(models.Model):
    """
    Model representing a pre-defined card.
    """
    TYPES = (
        ('str', 'Text'),
        ('num', 'Numerical'),
        ('dec', 'Decimal')
    )
    """The types an answer can have, which influences how an answer is checked."""

    collection = models.ForeignKey('Collection')
    """The collection the card belongs to."""

    front = models.CharField(max_length=255)
    """The text to show on the "front" of the card, i.e. the question."""

    back = models.CharField(max_length=255)
    """The text on the back of the card, i.e. the correct answer."""

    answer_type = models.CharField(max_length=3, choices=TYPES, default='str')
    """The type of answer that is expected."""

    def compare_answer(self, answer):
        """
        Compare `answer` to the back of the card.

        :param str answer: The answer to compare.
        :return: True when the answer can be considered to be equal to the back
                 of the card, else False.
        """
        return answer == self.back

    def __str__(self):
        return self.front[:20]

    def __repr__(self):
        return "%s(%s)" % (self.__class__.__name__, self.pk)
