# Crescendo 🎵

> An AR music practice tool that lets you see, play, and perfect your music in real time.

Crescendo is a wearable music assistant built for the Mentra Glasses (Even Realities G1) that overlays visual music cues on the lenses while listening to your performance through pitch detection. Powered by a lightweight Express.js backend with Tone.js and open-source pitch detection, Crescendo delivers real-time feedback to help musicians improve their pitch accuracy and practice more effectively.

**Location:** Table 1

## 🏆 Sponsor Challenges

- **Suno:** Best Musical Hack
- **Mentra Challenge**

## 💡 Inspiration

Our team was brought together not only by a passion for coding, but also by a deep love of music. Each of us has been playing instruments for years and understands the challenge of staying on pitch and improving without constant feedback. We decided to combine these two passions—technology and music—into a project that makes practice more engaging, interactive, and accessible for anyone who wants to learn or perform.

## ✨ What it does

Our project is a wearable music assistant for Mentra display glasses that helps users improve singing or playing in real time. While wearing the glasses, users see the song title, lyrics, and expected pitch scrolling across the display. As they perform, the system listens, compares their voice or instrument to the original music file, and instantly shows whether they are on pitch or off. At the end, it provides a performance summary with accuracy stats and personalized feedback.

## 🛠️ How we built it

We started by exploring how to program and display information on the Mentra glasses. Since it was our first time working with this hardware, we spent time learning the SDK and experimenting with how to show lyrics, titles, and pitch indicators on the display. We then integrated real-time audio input, analyzed the user's pitch, and compared it to the notes from the imported music file. Finally, we connected everything into an interactive experience that gives both live feedback and a performance summary.

## 👥 Individual Contributions

- **Jamie Caleb:** Worked on sourcing MIDI files and extracting to get lyrics and notes
- **Carolyn Do:** Connected glasses to application and synced the lyrics and notes to display on the glasses
- **Mirada Makhmutova:** Was able to implement pitch correcting feature

## 🚧 Challenges we ran into

Getting the glasses to work was one of our biggest hurdles—the initial setup alone took about two hours, and syncing them with other team members' devices added more complexity and time. On top of that, finding suitable MIDI files for our application to use was unexpectedly difficult and took longer than we anticipated.

## 🎉 Accomplishments that we're proud of

Successfully getting the smart glasses up and running from connecting and configuring them to deploying our first working application on the device. Overcoming the steep initial setup curve and seeing our project come to life on the glasses was a huge milestone for us.

## 📚 What we learned

As this was our first time developing for smart glasses, every step was a learning experience—from pairing the glasses and setting up an account to building an application linked to the device and customizing what gets displayed on the lenses. We gained valuable hands-on experience navigating a new hardware platform and development ecosystem from the ground up!

## 🔮 What's next for our project

Future features to implement include:

- Being able to use the built-in microphone from the glasses instead of the laptop
- Implementing live lyric tracking to detect what words are being sung
- Analyze pronunciation accuracy and provide feedback to help users improve their diction while singing
- The ability to display sheet music directly on the glasses
- Potentially implement an auto-scroll feature to help users keep their place in the song as they play or sing

## 🔗 Links

- [Video Demo](https://youtu.be/ml5WGM8FJvk)

---

*Built with ❤️ for HackMIT 2025*