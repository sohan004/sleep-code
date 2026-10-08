import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "xamarin",
  project: "couriermate-forms",
  branch: "fix/offline-delivery-queue",
  indent: "Spaces: 4",
  files: [
    "Couriermate/App.xaml.cs",
    "Couriermate/AppShell.xaml",
    "Couriermate/Models/DeliveryStop.cs",
    "Couriermate/Services/IDeliveryService.cs",
    "Couriermate/Services/IDeliveryStore.cs",
    "Couriermate/ViewModels/BaseViewModel.cs",
    "Couriermate/ViewModels/DeliveryListViewModel.cs",
    "Couriermate/Views/DeliveryListPage.xaml",
    "Couriermate/Views/DeliveryListPage.xaml.cs",
    "Couriermate.Android/MainActivity.cs",
  ],
  snippets: [
    {
      filename: "Couriermate/ViewModels/DeliveryListViewModel.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using System;
using System.Collections.ObjectModel;
using System.Diagnostics;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Input;
using Couriermate.Models;
using Couriermate.Services;
using Xamarin.Essentials;
using Xamarin.Forms;

namespace Couriermate.ViewModels
{
    public class DeliveryListViewModel : BaseViewModel
    {
        public const string StopDeliveredMessage = "StopDelivered";

        readonly IDeliveryService deliveryService;
        readonly IDeliveryStore localStore;
        CancellationTokenSource loadCts;
        bool isRefreshing;
        string statusMessage;

        public DeliveryListViewModel(IDeliveryService deliveryService, IDeliveryStore localStore)
        {
            this.deliveryService = deliveryService;
            this.localStore = localStore;
            Title = "Today's run";
            RefreshCommand = new Command(async () => await LoadAsync());
            MarkDeliveredCommand = new Command<DeliveryStop>(async s => await MarkDelivered(s));
        }

        public ObservableCollection<DeliveryStop> Stops { get; } =
            new ObservableCollection<DeliveryStop>();

        public ICommand RefreshCommand { get; }
        public ICommand MarkDeliveredCommand { get; }

        public int RemainingCount => Stops.Count(s => !s.IsDelivered);

        public bool IsRefreshing
        {
            get => isRefreshing;
            set => SetProperty(ref isRefreshing, value);
        }

        public string StatusMessage
        {
            get => statusMessage;
            set => SetProperty(ref statusMessage, value);
        }

        public async Task LoadAsync()
        {
            loadCts?.Cancel();
            loadCts = new CancellationTokenSource();
            var token = loadCts.Token;
            IsRefreshing = true;
            try
            {
                var online = Connectivity.NetworkAccess == NetworkAccess.Internet;
                var stops = online
                    ? await deliveryService.GetTodaysStopsAsync(token)
                    : await localStore.GetStopsAsync();
                if (online) await localStore.SaveStopsAsync(stops);
                token.ThrowIfCancellationRequested();

                Stops.Clear();
                foreach (var stop in stops.OrderBy(s => s.Sequence)) Stops.Add(stop);
                StatusMessage = online ? null : "Offline: showing last synced run";
                OnPropertyChanged(nameof(RemainingCount));
            }
            catch (OperationCanceledException) { }
            catch (Exception ex)
            {
                Debug.WriteLine(ex);
                StatusMessage = "Couldn't load deliveries. Pull down to retry.";
            }
            finally
            {
                IsRefreshing = false;
            }
        }

        async Task MarkDelivered(DeliveryStop stop)
        {
            if (stop == null || stop.IsDelivered) return;
            stop.IsDelivered = true;
            stop.DeliveredAt = DateTimeOffset.Now;
            // Queue locally first so a dropped connection never loses a delivery
            await localStore.QueueUpdateAsync(stop);
            OnPropertyChanged(nameof(RemainingCount));
            MessagingCenter.Send(this, StopDeliveredMessage, stop.Id);

            if (Connectivity.NetworkAccess == NetworkAccess.Internet)
                await deliveryService.FlushQueueAsync(localStore, CancellationToken.None);
        }
    }
}
`,
    },
    {
      filename: "Couriermate/Views/DeliveryListPage.xaml.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using System;
using Couriermate.Models;
using Couriermate.ViewModels;
using Xamarin.Essentials;
using Xamarin.Forms;
using Xamarin.Forms.Xaml;

namespace Couriermate.Views
{
    [XamlCompilation(XamlCompilationOptions.Compile)]
    public partial class DeliveryListPage : ContentPage
    {
        readonly DeliveryListViewModel viewModel;

        public DeliveryListPage(DeliveryListViewModel viewModel)
        {
            InitializeComponent();
            BindingContext = this.viewModel = viewModel;
        }

        protected override async void OnAppearing()
        {
            base.OnAppearing();
            Connectivity.ConnectivityChanged += OnConnectivityChanged;
            MessagingCenter.Subscribe<DeliveryListViewModel, string>(
                this, DeliveryListViewModel.StopDeliveredMessage, OnStopDelivered);

            OfflineBanner.IsVisible = Connectivity.NetworkAccess != NetworkAccess.Internet;
            if (viewModel.Stops.Count == 0)
                await viewModel.LoadAsync();
        }

        protected override void OnDisappearing()
        {
            base.OnDisappearing();
            Connectivity.ConnectivityChanged -= OnConnectivityChanged;
            MessagingCenter.Unsubscribe<DeliveryListViewModel, string>(
                this, DeliveryListViewModel.StopDeliveredMessage);
        }

        void OnConnectivityChanged(object sender, ConnectivityChangedEventArgs e)
        {
            // Essentials raises this on a background thread on Android
            Device.BeginInvokeOnMainThread(async () =>
            {
                var offline = e.NetworkAccess != NetworkAccess.Internet;
                OfflineBanner.IsVisible = offline;
                if (!offline) await viewModel.LoadAsync();
            });
        }

        void OnStopDelivered(DeliveryListViewModel sender, string stopId)
        {
            Device.BeginInvokeOnMainThread(() =>
            {
                RemainingLabel.Text = $"{viewModel.RemainingCount} stops remaining";
                AutomationProperties.SetName(RemainingLabel, RemainingLabel.Text);
            });
        }

        async void OnCallRecipientClicked(object sender, EventArgs e)
        {
            if (!((sender as BindableObject)?.BindingContext is DeliveryStop stop))
                return;
            try
            {
                PhoneDialer.Open(stop.ContactNumber);
            }
            catch (FeatureNotSupportedException)
            {
                await DisplayAlert("Unavailable", "Calling isn't supported on this device.", "OK");
            }
            catch (ArgumentNullException)
            {
                await DisplayAlert("No number", "This stop has no contact number.", "OK");
            }
        }
    }
}
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "We're stuck on Xamarin.Forms until the MAUI migration. Anything risky in `OnAppearing` being `async void`?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "`async void` is acceptable for lifecycle overrides and event handlers because there's no caller to return a `Task` to. The risk is exceptions: anything thrown after the first `await` goes to the synchronisation context and crashes the app.\n\nHere you're mostly covered, because `LoadAsync` catches everything internally. Two things to tighten:\n1. `OnConnectivityChanged` uses an `async` lambda inside `BeginInvokeOnMainThread`, which is also effectively `async void`. Same reasoning applies, so keep `LoadAsync` exception-safe.\n2. `OnAppearing` runs every time you come back from the detail page. The `Stops.Count == 0` guard avoids a reload, but it also means a stale list after midnight. Consider a timestamp check instead.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Is `MessagingCenter` still OK here, or should I change it before migrating?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "It works, and your subscribe/unsubscribe pairing in `OnAppearing`/`OnDisappearing` is correct. But `MessagingCenter` is deprecated in .NET MAUI, so switching now reduces migration work.\n\nThe drop-in replacement is `WeakReferenceMessenger` from `CommunityToolkit.Mvvm`, which supports Xamarin.Forms via .NET Standard 2.0:\n```csharp\npublic sealed class StopDeliveredMessage : ValueChangedMessage<string>\n{\n    public StopDeliveredMessage(string id) : base(id) { }\n}\n```\nSend with `WeakReferenceMessenger.Default.Send(new StopDeliveredMessage(stop.Id))`.\n\nHonestly, for this case you may not need messaging at all: the page already binds to the view model, so `RemainingLabel` could bind to `RemainingCount` directly.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Good point. Any issue with how the offline queue flushes?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "Two gaps:\n1. **Failures aren't handled.** If `FlushQueueAsync` throws (timeout, 500), the exception escapes `MarkDelivered`, and because the command lambda is `async void` underneath, it can crash the app. Wrap it in `try/catch` and leave the item queued.\n2. **Nothing flushes on reconnect.** When `OnConnectivityChanged` reports online, it reloads but never drains the queue. Worse, `LoadAsync` then calls `SaveStopsAsync` with server data that doesn't yet include the queued deliveries, so the UI can show stops as undelivered.\n\nFlush the queue first, then load. Ideally move that into a single `SyncAsync` on the view model so the page only reacts to connectivity changes.",
      delay: 60000,
    },
  ],
};

export default config;
