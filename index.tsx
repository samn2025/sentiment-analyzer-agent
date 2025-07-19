/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Type } from '@google/genai';
import * as d3 from 'd3';
import d3Cloud from 'd3-cloud';
import { schemeCategory10 } from 'd3-scale-chromatic';

// Correctly initialize the GoogleGenAI client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// To store the latest analysis data for download
let analysisData: { summary: any; individual: any[] } | null = null;

function App() {
  // --- UI Element Creation ---
  const container = document.createElement('div');
  container.className = 'container';

  const title = document.createElement('h1');
  title.textContent = 'Reddit Post Sentiment Analyzer';

  const description = document.createElement('p');
  description.innerHTML =
    'Enter one or more Reddit post URLs (one per line) to analyze comment sentiment and identify key trends.';

  const inputGroup = document.createElement('div');
  inputGroup.className = 'input-group';

  const textarea = document.createElement('textarea');
  textarea.placeholder =
    'https://www.reddit.com/r/...\nhttps://www.reddit.com/r/...';
  textarea.setAttribute('aria-label', 'Reddit Post URLs');
  textarea.rows = 4;

  const analyzeButton = document.createElement('button');
  analyzeButton.textContent = 'Analyze Posts';
  analyzeButton.setAttribute('aria-live', 'polite');

  inputGroup.append(textarea, analyzeButton);

  const loader = document.createElement('div');
  loader.className = 'loader hidden';

  const errorContainer = document.createElement('div');
  errorContainer.className = 'error hidden';
  errorContainer.setAttribute('role', 'alert');

  const filterBar = document.createElement('div');
  filterBar.className = 'filter-bar hidden';
  
  const resultsContainer = document.createElement('div');
  resultsContainer.className = 'results-container hidden';

  const resultsHeader = document.createElement('div');
  resultsHeader.className = 'results-header hidden';

  const downloadButton = document.createElement('button');
  downloadButton.className = 'download-button';
  downloadButton.textContent = 'Download Results (CSV)';
  downloadButton.setAttribute(
    'aria-label',
    'Download analysis results as a CSV file'
  );

  resultsHeader.append(downloadButton);

  document.body.append(container);
  container.append(
    title,
    description,
    inputGroup,
    loader,
    errorContainer,
    filterBar,
    resultsHeader,
    resultsContainer
  );

  // --- Event Listeners ---
  analyzeButton.addEventListener('click', handleAnalysis);
  downloadButton.addEventListener('click', () => {
    if (analysisData) {
      downloadAsCSV(analysisData.individual);
    }
  });

  // --- Core Logic ---
  async function handleAnalysis() {
    const urls = textarea.value
      .split('\n')
      .map((u) => u.trim())
      .filter(Boolean);

    if (urls.length === 0) {
      showError('Please enter at least one valid Reddit URL.');
      return;
    }

    if (urls.some((url) => !url.includes('reddit.com'))) {
      showError('Please ensure all entries are valid Reddit URLs.');
      return;
    }

    setLoadingState(true);
    analysisData = null; // Clear previous data

    try {
      const systemInstruction = `You are a world-class Sentiment Analyst Agent. Your task is to analyze the comments on the given Reddit posts. For EACH post URL provided, you must perform a separate analysis. Categorize comments into "Positive", "Neutral", and "Negative". For each category within each post, provide the total count of comments, the percentage of the total, a list of the most frequent keywords, and a few example comments. Return the result as an array of objects, one for each URL.`;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            description: "An array of sentiment analysis results, one for each URL.",
            items: {
              type: Type.OBJECT,
              properties: {
                url: { type: Type.STRING, description: "The Reddit post URL."},
                sentimentBreakdown: {
                  type: Type.OBJECT,
                  properties: {
                    positive: {
                      type: Type.OBJECT,
                      properties: {
                        count: { type: Type.INTEGER, description: 'Total number of positive comments.' },
                        percentage: { type: Type.INTEGER, description: 'Percentage of positive comments (0-100).' },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Frequent keywords in positive comments.' },
                        comments: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Examples of positive comments.' }
                      },
                      required: ['count', 'percentage', 'keywords', 'comments']
                    },
                    neutral: {
                      type: Type.OBJECT,
                      properties: {
                        count: { type: Type.INTEGER, description: 'Total number of neutral comments.' },
                        percentage: { type: Type.INTEGER, description: 'Percentage of neutral comments (0-100).' },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Frequent keywords in neutral comments.' },
                        comments: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Examples of neutral comments.' }
                      },
                       required: ['count', 'percentage', 'keywords', 'comments']
                    },
                    negative: {
                      type: Type.OBJECT,
                      properties: {
                        count: { type: Type.INTEGER, description: 'Total number of negative comments.' },
                        percentage: { type: Type.INTEGER, description: 'Percentage of negative comments (0-100).' },
                        keywords: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Frequent keywords in negative comments.' },
                        comments: { type: Type.ARRAY, items: { type: Type.STRING }, description: 'Examples of negative comments.' }
                      },
                       required: ['count', 'percentage', 'keywords', 'comments']
                    }
                  },
                  required: ['positive', 'neutral', 'negative']
                }
              },
              required: ['url', 'sentimentBreakdown']
            }
          }
        },
        required: ['results']
      };
      
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Please perform a sentiment analysis on the comments of these Reddit posts:\n${urls.join(
          '\n'
        )}`,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        },
      });

      const data = JSON.parse(response.text);
      const individualResults = data.results;
      const summary = aggregateData(individualResults);
      analysisData = { summary, individual: individualResults };
      
      displayResults(analysisData);

    } catch (e) {
      console.error(e);
      showError(
        'Could not analyze the post(s). The model may be unable to access the URL(s) or the content is restricted. Please try again.'
      );
    } finally {
      setLoadingState(false);
    }
  }

  // --- UI Update Functions ---
  function setLoadingState(isLoading: boolean) {
    resultsContainer.innerHTML = '';
    filterBar.innerHTML = '';
    errorContainer.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    resultsHeader.classList.add('hidden');
    filterBar.classList.add('hidden');
    
    if (isLoading) {
      loader.classList.remove('hidden');
      analyzeButton.disabled = true;
      analyzeButton.textContent = 'Analyzing...';
    } else {
      loader.classList.add('hidden');
      analyzeButton.disabled = false;
      analyzeButton.textContent = 'Analyze Posts';
    }
  }

  function showError(message: string) {
    errorContainer.textContent = message;
    errorContainer.classList.remove('hidden');
  }
  
  function aggregateData(results: any[]) {
      const summary = {
          positive: { count: 0, keywords: [], comments: [], percentage: 0 },
          neutral: { count: 0, keywords: [], comments: [], percentage: 0 },
          negative: { count: 0, keywords: [], comments: [], percentage: 0 }
      };
  
      let totalComments = 0;
  
      results.forEach(result => {
          const breakdown = result.sentimentBreakdown;
          for (const sentiment of ['positive', 'neutral', 'negative']) {
              if (breakdown[sentiment]) {
                  summary[sentiment].count += breakdown[sentiment].count;
                  summary[sentiment].keywords.push(...breakdown[sentiment].keywords);
                  summary[sentiment].comments.push(...breakdown[sentiment].comments);
                  totalComments += breakdown[sentiment].count;
              }
          }
      });
  
      if (totalComments > 0) {
        for (const sentiment of ['positive', 'neutral', 'negative']) {
          summary[sentiment].percentage = Math.round((summary[sentiment].count / totalComments) * 100);
        }
      }
      
      return { url: "All Posts", sentimentBreakdown: summary };
  }

  function downloadAsCSV(data: any[]) {
    const headers = ['URL', 'Sentiment', 'Percentage', 'Comment Count', 'Keywords', 'Sample Comments'];

    const formatArrayForCSV = (arr: string[]) => `"${arr.join('; ').replace(/"/g, '""')}"`;

    const rows = data.flatMap(result => {
      return ['positive', 'neutral', 'negative'].map(sentiment => {
        const categoryData = result.sentimentBreakdown[sentiment];
        if (!categoryData) return '';
        
        return [
            `"${result.url}"`,
            `"${sentiment.charAt(0).toUpperCase() + sentiment.slice(1)}"`,
            categoryData.percentage,
            categoryData.count,
            formatArrayForCSV(categoryData.keywords),
            formatArrayForCSV(categoryData.comments)
        ].join(',');
      });
    });

    let csvContent = headers.join(',') + '\n' + rows.filter(Boolean).join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'reddit_sentiment_analysis.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  
  function createWordCloud(container: HTMLElement, words: string[]) {
    const wordFrequencies = words.reduce((map, word) => {
        map[word] = (map[word] || 0) + 1;
        return map;
    }, {});

    const wordEntries = Object.entries(wordFrequencies).map(([text, size]) => ({ text, size }));
    
    // Sort by frequency for better sizing
    wordEntries.sort((a,b) => b.size - a.size);
    const maxSize = 35;
    const minSize = 10;
    const sizeScale = d3.scaleSqrt()
      .domain([d3.min(wordEntries, d => d.size)!, d3.max(wordEntries, d => d.size)!])
      .range([minSize, maxSize]);


    const layout = d3Cloud()
        .size([container.clientWidth, 200])
        .words(wordEntries.map(d => ({text: d.text, size: sizeScale(d.size)})))
        .padding(5)
        .rotate(() => (~~(Math.random() * 6) - 3) * 15) // Random rotation
        .font("Impact")
        .fontSize(d => d.size!)
        .on("end", draw);

    layout.start();

    function draw(words: d3Cloud.Word[]) {
        const svg = d3.select(container).append("svg")
            .attr("width", layout.size()[0])
            .attr("height", layout.size()[1]);
        
        const g = svg.append("g")
            .attr("transform", "translate(" + layout.size()[0] / 2 + "," + layout.size()[1] / 2 + ")");

        const colorScale = d3.scaleOrdinal(schemeCategory10);

        g.selectAll("text")
            .data(words)
            .enter().append("text")
            .style("font-size", d => d.size! + "px")
            .style("font-family", "Impact")
            .style("fill", (d, i) => colorScale(i))
            .attr("text-anchor", "middle")
            .attr("transform", d => `translate(${d.x}, ${d.y})rotate(${d.rotate})`)
            .text(d => d.text);
    }
  }
  
  function renderAnalysisView(data: any) {
    resultsContainer.innerHTML = ''; // Clear previous view
    const breakdownContainer = document.createElement('div');
    breakdownContainer.className = 'sentiment-breakdown';
    
    const sentiments = ['positive', 'neutral', 'negative'];

    sentiments.forEach(sentiment => {
      const categoryData = data.sentimentBreakdown[sentiment];
      if (!categoryData) return;

      const card = document.createElement('div');
      card.className = `sentiment-card ${sentiment}`;
      
      const title = document.createElement('h2');
      title.textContent = sentiment.charAt(0).toUpperCase() + sentiment.slice(1);
      
      const percentage = document.createElement('div');
      percentage.className = 'percentage';
      percentage.textContent = `${categoryData.percentage}%`;
      
      const count = document.createElement('p');
      count.className = 'comment-count';
      count.textContent = `${categoryData.count} Comment${categoryData.count === 1 ? '' : 's'}`;

      const wordCloudTitle = document.createElement('h3');
      wordCloudTitle.textContent = 'Trending Keywords';
      
      const wordCloudContainer = document.createElement('div');
      wordCloudContainer.className = 'word-cloud-container';
      
      const commentsTitle = document.createElement('h3');
      commentsTitle.textContent = 'Sample Comments';
      
      const commentsList = document.createElement('ul');
      commentsList.className = 'comments-list';
      (categoryData.comments || []).slice(0, 3).forEach((comment: string) => { // Limit to 3 samples
        const li = document.createElement('li');
        li.className = 'comment';
        li.textContent = comment;
        commentsList.append(li);
      });

      card.append(title, percentage, count, wordCloudTitle, wordCloudContainer, commentsTitle, commentsList);
      breakdownContainer.append(card);
      
      // Render word cloud after card is in DOM
      if (categoryData.keywords && categoryData.keywords.length > 0) {
        setTimeout(() => createWordCloud(wordCloudContainer, categoryData.keywords), 0);
      } else {
        wordCloudContainer.textContent = 'No keywords found.';
        wordCloudContainer.style.textAlign = 'center';
        wordCloudContainer.style.opacity = '0.7';
      }
    });

    resultsContainer.append(breakdownContainer);
    resultsContainer.classList.remove('hidden');
    resultsHeader.classList.remove('hidden');
  }

  function displayResults(data: { summary: any; individual: any[] }) {
    filterBar.innerHTML = '';
    
    const { summary, individual } = data;
    
    // Add summary button
    const allButton = document.createElement('button');
    allButton.textContent = 'All Posts (Summary)';
    allButton.className = 'filter-button active';
    allButton.addEventListener('click', (e) => {
        document.querySelectorAll('.filter-button').forEach(b => b.classList.remove('active'));
        (e.currentTarget as HTMLElement).classList.add('active');
        renderAnalysisView(summary);
    });
    filterBar.append(allButton);
    
    // Add individual buttons if more than one
    if (individual.length > 1) {
      individual.forEach((result, index) => {
          const button = document.createElement('button');
          // Shorten URL for display
          const urlPath = result.url.match(/reddit\.com(\/r\/[^/]+\/comments\/[^/]+)/);
          button.textContent = urlPath ? `Post ${index + 1}` : `Post ${index + 1}`;
          button.title = result.url;
          button.className = 'filter-button';
          button.addEventListener('click', (e) => {
            document.querySelectorAll('.filter-button').forEach(b => b.classList.remove('active'));
            (e.currentTarget as HTMLElement).classList.add('active');
            renderAnalysisView(result);
          });
          filterBar.append(button);
      });
    }

    filterBar.classList.remove('hidden');
    renderAnalysisView(summary); // Show summary by default
  }
}

// Initialize the application
App();
