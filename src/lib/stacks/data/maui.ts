import type { StackConfig } from "../types";

const config: StackConfig = {
  id: "maui",
  project: "sitecheck-maui",
  branch: "feat/offline-inspections",
  indent: "Spaces: 4",
  files: [
    "SiteCheck.csproj",
    "MauiProgram.cs",
    "AppShell.xaml",
    "Models/InspectionSummary.cs",
    "Services/IInspectionService.cs",
    "ViewModels/InspectionListViewModel.cs",
    "Views/InspectionListPage.xaml",
    "Views/InspectionListPage.xaml.cs",
    "SiteCheck.Tests/InspectionListViewModelTests.cs",
  ],
  snippets: [
    {
      filename: "ViewModels/InspectionListViewModel.cs",
      syntax: "clike",
      languageLabel: "C#",
      code: `using System.Collections.ObjectModel;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using CommunityToolkit.Mvvm.Messaging;
using Microsoft.Extensions.Logging;
using SiteCheck.Messages;
using SiteCheck.Models;
using SiteCheck.Services;

namespace SiteCheck.ViewModels;

public partial class InspectionListViewModel : ObservableObject, IRecipient<InspectionSavedMessage>
{
    private readonly IInspectionService _service;
    private readonly IConnectivity _connectivity;
    private readonly ILogger<InspectionListViewModel> _logger;

    public InspectionListViewModel(
        IInspectionService service,
        IConnectivity connectivity,
        ILogger<InspectionListViewModel> logger)
    {
        _service = service;
        _connectivity = connectivity;
        _logger = logger;
        IsOffline = connectivity.NetworkAccess != NetworkAccess.Internet;
        _connectivity.ConnectivityChanged += OnConnectivityChanged;
        WeakReferenceMessenger.Default.Register(this);
    }

    public ObservableCollection<InspectionSummary> Inspections { get; } = [];

    [ObservableProperty]
    public partial bool IsRefreshing { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusText))]
    [NotifyCanExecuteChangedFor(nameof(SyncCommand))]
    public partial bool IsOffline { get; set; }

    [ObservableProperty]
    [NotifyPropertyChangedFor(nameof(StatusText))]
    [NotifyCanExecuteChangedFor(nameof(SyncCommand))]
    public partial int PendingUploads { get; set; }

    public string StatusText => IsOffline
        ? $"Offline · {PendingUploads} waiting to sync"
        : "All changes synced";

    [RelayCommand]
    private async Task LoadAsync(CancellationToken token)
    {
        try
        {
            var items = await _service.GetInspectionsAsync(token);
            Inspections.Clear();
            foreach (var item in items)
            {
                Inspections.Add(item);
            }
            PendingUploads = await _service.CountPendingAsync(token);
        }
        catch (OperationCanceledException)
        {
            // Page navigated away; nothing to report
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Failed to load inspections");
            await Shell.Current.DisplayAlertAsync("Couldn't load", "Showing saved data.", "OK");
        }
        finally
        {
            IsRefreshing = false;
        }
    }

    [RelayCommand(CanExecute = nameof(CanSync))]
    private async Task SyncAsync(CancellationToken token)
    {
        PendingUploads = await _service.UploadPendingAsync(token);
        await LoadCommand.ExecuteAsync(null);
    }

    private bool CanSync() => PendingUploads > 0 && !IsOffline;

    [RelayCommand]
    private Task OpenAsync(InspectionSummary inspection) =>
        Shell.Current.GoToAsync("inspection", new ShellNavigationQueryParameters
        {
            ["Inspection"] = inspection,
        });

    public void Receive(InspectionSavedMessage message) =>
        MainThread.BeginInvokeOnMainThread(() => PendingUploads++);

    private void OnConnectivityChanged(object? sender, ConnectivityChangedEventArgs e) =>
        MainThread.BeginInvokeOnMainThread(() =>
            IsOffline = e.NetworkAccess != NetworkAccess.Internet);
}
`,
    },
    {
      filename: "Views/InspectionListPage.xaml",
      syntax: "markup",
      languageLabel: "XML",
      code: `<?xml version="1.0" encoding="utf-8" ?>
<ContentPage xmlns="http://schemas.microsoft.com/dotnet/2021/maui"
             xmlns:x="http://schemas.microsoft.com/winfx/2009/xaml"
             xmlns:toolkit="http://schemas.microsoft.com/dotnet/2022/maui/toolkit"
             xmlns:vm="clr-namespace:SiteCheck.ViewModels"
             xmlns:models="clr-namespace:SiteCheck.Models"
             x:Class="SiteCheck.Views.InspectionListPage"
             x:DataType="vm:InspectionListViewModel"
             Title="Inspections">

  <ContentPage.Behaviors>
    <toolkit:EventToCommandBehavior EventName="Appearing"
                                    Command="{Binding LoadCommand}" />
  </ContentPage.Behaviors>

  <ContentPage.ToolbarItems>
    <ToolbarItem Text="Sync"
                 Command="{Binding SyncCommand}"
                 SemanticProperties.Description="Upload pending inspections" />
  </ContentPage.ToolbarItems>

  <Grid RowDefinitions="Auto,*">
    <Border Grid.Row="0"
            IsVisible="{Binding IsOffline}"
            BackgroundColor="{StaticResource Warning}"
            StrokeThickness="0"
            Padding="12,8">
      <Label Text="{Binding StatusText}"
             TextColor="{StaticResource OnWarning}"
             SemanticProperties.HeadingLevel="Level2" />
    </Border>

    <RefreshView Grid.Row="1"
                 IsRefreshing="{Binding IsRefreshing}"
                 Command="{Binding LoadCommand}">
      <CollectionView ItemsSource="{Binding Inspections}"
                      SelectionMode="None">
        <CollectionView.EmptyView>
          <Label Text="No inspections yet. Pull down to refresh."
                 HorizontalOptions="Center"
                 Margin="0,48,0,0" />
        </CollectionView.EmptyView>
        <CollectionView.ItemTemplate>
          <DataTemplate x:DataType="models:InspectionSummary">
            <Grid Padding="16,12"
                  ColumnDefinitions="*,Auto"
                  RowDefinitions="Auto,Auto"
                  SemanticProperties.Description="{Binding AccessibleSummary}">
              <Grid.GestureRecognizers>
                <TapGestureRecognizer
                  CommandParameter="{Binding .}"
                  Command="{Binding OpenCommand, x:DataType=vm:InspectionListViewModel,
                    Source={RelativeSource AncestorType={x:Type vm:InspectionListViewModel}}}" />
              </Grid.GestureRecognizers>
              <Label Text="{Binding SiteName}"
                     FontAttributes="Bold"
                     FontSize="16" />
              <Label Grid.Row="1"
                     Text="{Binding DueDate, StringFormat='Due {0:d MMM yyyy}'}"
                     TextColor="{AppThemeBinding Light=#475569, Dark=#CBD5E1}" />
              <Label Grid.Column="1"
                     Grid.RowSpan="2"
                     Text="{Binding StatusLabel}"
                     VerticalOptions="Center" />
            </Grid>
          </DataTemplate>
        </CollectionView.ItemTemplate>
      </CollectionView>
    </RefreshView>
  </Grid>
</ContentPage>
`,
    },
  ],
  chat: [
    {
      role: "user",
      content:
        "Loading 400 inspections makes the CollectionView hitch. Is `Clear()` plus `Add()` in a loop the problem?",
      delay: 3000,
    },
    {
      role: "assistant",
      content:
        "Very likely. `ObservableCollection` raises `CollectionChanged` once per `Add`, so 400 items means 401 notifications, each of which the platform handler turns into an insert on the native list.\n\nOptions, cheapest first:\n1. Replace the collection: make `Inspections` an `[ObservableProperty]` and assign `new ObservableCollection<InspectionSummary>(items)`. The `CollectionView` rebinds once.\n2. Use `ObservableRangeCollection` (from the MvvmHelpers package, or a small subclass of your own) with `ReplaceRange`, which raises a single `Reset`.\n\nAlso keep the `DataTemplate` flat - your single `Grid` is good - and make sure compiled bindings stay on via `x:DataType`, which you already have.",
      delay: 12000,
    },
    {
      role: "user",
      content: "Do I leak the view model through `ConnectivityChanged`?",
      delay: 24000,
    },
    {
      role: "assistant",
      content:
        "Potentially, yes. `IConnectivity` is typically registered as a singleton (`Connectivity.Current`), and subscribing with `+=` gives it a strong reference to the view model. If `InspectionListViewModel` is registered as **transient**, every page instance creates a new one that's never collected.\n\nThe messenger registration is fine because `WeakReferenceMessenger` holds weak references.\n\nFixes:\n1. Register the view model and page as singletons if this is a root tab.\n2. Otherwise, implement `IDisposable` or add `Start()`/`Stop()` methods called from `OnAppearing`/`OnDisappearing` in the code-behind, and unsubscribe with `-=`.\n\nThe second option also stops the banner updating while the page is hidden.",
      delay: 36000,
    },
    {
      role: "user",
      content: "Is calling `Shell.Current` from the view model a problem for unit tests?",
      delay: 48000,
    },
    {
      role: "assistant",
      content:
        "It is. `Shell.Current` is a static that's `null` outside a running app, so `LoadAsync`'s error path and `OpenAsync` will throw `NullReferenceException` in tests.\n\nWrap navigation and alerts behind a small interface:\n```csharp\npublic interface INavigationService\n{\n    Task GoToAsync(string route, ShellNavigationQueryParameters parameters);\n    Task AlertAsync(string title, string message);\n}\n```\nRegister a Shell-backed implementation in `MauiProgram.cs` and inject it. In tests, a fake records calls so you can assert the route and parameters. `MainThread.BeginInvokeOnMainThread` has the same problem; an `IDispatcher` injected from DI is easier to fake.",
      delay: 60000,
    },
  ],
};

export default config;
