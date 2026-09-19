const CALLER_NAMES = [
  'Robert Hensley', 'Maria Chen', 'David Okafor', 'Linda Patterson', 'James Whitfield',
  'Susan Alvarez', 'Michael Brooks', 'Patricia Nguyen', 'Kevin Sartori', 'Angela Baxter'
];

export const CALL_TEMPLATES = [
  {
    title: 'Vandalism In Progress',
    type: 'police',
    opening: 'Someone is spray-painting the back wall of the store on the corner right now.',
    questions: [
      { q: 'Can you confirm the exact location?', a: "It's the strip of shops right at the intersection, around back." },
      { q: 'Can you describe the person doing it?', a: 'Dark hoodie, maybe a teenager — hard to tell from here.' },
      { q: 'Does the person appear to have any weapon?', a: 'No, just a couple of spray cans.' },
      { q: 'Are they still on scene right now?', a: 'Yes, still there as far as I can tell.' },
      { q: 'Is anyone else nearby or in danger?', a: 'No, the area looks pretty empty otherwise.' }
    ]
  },
  {
    title: 'Structure Fire',
    type: 'fire',
    opening: "There's smoke coming out of a kitchen window at the house next door.",
    questions: [
      { q: 'Is anyone still inside the building?', a: "I'm not sure — I haven't seen anyone come out." },
      { q: 'Can you see visible flames or just smoke?', a: 'Mostly smoke, but it just started to look brighter near the window.' },
      { q: 'Has anyone pulled a fire alarm?', a: "No, there's no alarm on this street." },
      { q: 'How many floors does the building have?', a: "Just two floors, it's a small duplex." },
      { q: 'Are you at a safe distance right now?', a: "Yes, I'm already across the street." }
    ]
  },
  {
    title: 'Chest Pain / Difficulty Breathing',
    type: 'medical',
    opening: 'My father is clutching his chest and having trouble breathing.',
    questions: [
      { q: 'Is he conscious and able to talk?', a: "Yes, but he's having a hard time getting words out." },
      { q: 'Does he have any known heart conditions?', a: 'Yes, he had a heart attack two years ago.' },
      { q: 'Is he sitting or lying down right now?', a: "He's sitting up in a chair." },
      { q: 'Do you have aspirin available?', a: "Yes, I think there's some in the bathroom." },
      { q: 'Is anyone else there to help you?', a: "My sister just got home, she's with him now." }
    ]
  },
  {
    title: 'Two-Vehicle Collision',
    type: 'police',
    opening: 'Two cars just collided at the intersection, one driver looks trapped.',
    questions: [
      { q: 'Is anyone seriously injured?', a: 'One driver is bleeding from the head, the other looks okay.' },
      { q: 'Are the vehicles blocking traffic?', a: 'Yes, both lanes are blocked right now.' },
      { q: 'Any fuel leaking from either vehicle?', a: "I think so, there's a smell of gasoline." },
      { q: 'Can the trapped driver move at all?', a: "A little, but the door on their side is jammed." },
      { q: 'Are any bystanders helping direct traffic?', a: 'A couple of people stopped to help.' }
    ]
  },
  {
    title: 'Residential Break-In',
    type: 'police',
    opening: 'I think someone just broke into the house next door — I heard glass breaking.',
    questions: [
      { q: 'Do you see anyone on the property right now?', a: 'I saw a shadow move past the side window a minute ago.' },
      { q: 'Is the homeowner home or away?', a: "They're on vacation, so the house should be empty." },
      { q: 'Did you hear anything after the glass broke?', a: 'It went quiet, which worries me more.' },
      { q: 'Are you in a safe location yourself?', a: "Yes, I'm inside my own house with the doors locked." },
      { q: 'Any vehicles nearby that seem out of place?', a: 'There is a dark van parked further down the street.' }
    ]
  },
  {
    title: 'Person Down, Unresponsive',
    type: 'medical',
    opening: "There's a man collapsed on the sidewalk, he's not responding.",
    questions: [
      { q: 'Is he breathing?', a: 'It looks shallow, but yes, he seems to be breathing.' },
      { q: 'Any visible injuries or bleeding?', a: 'No visible blood that I can see.' },
      { q: 'Has he responded to you at all?', a: 'No, I tried talking to him and shaking his shoulder gently.' },
      { q: 'Do you know if he has any medical conditions?', a: "I don't know him, he's a stranger." },
      { q: 'Is there an AED nearby?', a: "There's one in the pharmacy across the street." }
    ]
  }
];

export function randomCallerName() {
  return CALLER_NAMES[Math.floor(Math.random() * CALLER_NAMES.length)];
}

// Builds a fresh queue of incoming calls, tying each one to a real
// intersection returned by the backend so the dispatched unit always
// routes to an actual point on the road network.
export function generateCallQueue(intersections, count = 4) {
  const pool = [...CALL_TEMPLATES].sort(() => Math.random() - 0.5).slice(0, Math.min(count, CALL_TEMPLATES.length));
  return pool.map((tpl, i) => {
    const spot = intersections.length
      ? intersections[Math.floor(Math.random() * intersections.length)]
      : { code: 'MAIN-COLLEGE', name: 'Main St & College Ave', lat: 37.2296, lng: -80.4139 };
    return {
      id: `call-${Date.now()}-${i}`,
      ...tpl,
      code: spot.code,
      locationName: spot.name || spot.code,
      lat: spot.lat,
      lng: spot.lng,
      caller: randomCallerName(),
      status: 'waiting', // waiting | open | dispatched
      transcript: [
        { from: 'dispatcher', text: '911, what is your emergency?' },
        { from: 'caller', text: tpl.opening }
      ]
    };
  });
}
